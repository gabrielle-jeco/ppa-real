<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use App\Models\GuideRead;
use Illuminate\Http\Request;
use App\Models\Task;
use App\Models\TaskAssignmentBatch;
use App\Models\TaskDefinition;
use App\Models\User;
use App\Models\WorkStation;
use App\Services\UserNotificationService;
use App\Services\SupervisorTaskAccessService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class TaskController extends Controller
{
    private const TASK_WEIGHTS = [
        'mudah' => 2,
        'menengah' => 6,
        'sulit' => 10,
    ];

    public function taskCatalog()
    {
        return response()->json(
            WorkStation::with([
                'taskAreas' => fn ($query) => $query->orderBy('sort_order')->orderBy('name'),
                'taskAreas.taskDefinitions' => fn ($query) => $query->orderBy('sort_order')->orderBy('title'),
            ])
                ->orderBy('name')
                ->get()
        );
    }

    public function index(Request $request, $supervisorId)
    {
        $request->validate([
            'date' => 'nullable|date_format:Y-m-d',
            'role' => 'nullable|string|max:255',
        ]);

        $user = Auth::user();
        $targetDate = $request->has('date')
            ? Carbon::parse($request->date)
            : Carbon::now();

        if ($user->role_type !== 'manager' && $user->role_type !== 'supervisor') {
            if ($user->username !== $supervisorId) {
                return response()->json(['message' => 'Tidak memiliki akses.'], 403);
            }

            if (!$request->filled('role')) {
                return response()->json([
                    'message' => 'Silakan pilih work station sebelum mengakses pekerjaan.',
                    'guide_required' => true,
                ], 423);
            }

            if (
                in_array($user->role_type, ['employee', 'crew'], true)
                && $targetDate->isSameDay(Carbon::today())
                && !$this->hasConfirmedGuideForDate($user, $targetDate, $request->query('role'))
            ) {
                return response()->json([
                    'message' => 'Silakan konfirmasi panduan hari ini sebelum mengakses pekerjaan.',
                    'guide_required' => true,
                ], 423);
            }
        } else {
            if ($user->username !== $supervisorId) {
                $isSubordinate = $user->subordinateLines()->where('subordinate_id', $supervisorId)->where('status', 'active')->exists();
                if (!$isSubordinate) {
                    return response()->json(['message' => 'Tidak memiliki akses. User ini bukan bawahan Anda.'], 403);
                }
            }
        }

        $query = Task::where('employee_id', $supervisorId);

        if ($request->has('date')) {
            $query->activeOnDate($targetDate);
        }

        if ($request->filled('role')) {
            $workStation = $this->findWorkStationByRole($request->query('role'));

            if (!$workStation) {
                return response()->json(['message' => 'Work station tidak valid.'], 422);
            }

            $query->where(function ($stationQuery) use ($workStation) {
                $stationQuery->where('work_station_id', $workStation->id)
                    ->orWhereNull('work_station_id');
            });
        }

        $tasks = $query->with(['evidences', 'workStation', 'assignmentBatch'])
            ->orderBy('due_at', 'asc')
            ->get()
            ->unique(function (Task $task) {
                if (!$task->assignment_batch_id) {
                    return 'task:' . $task->id;
                }

                return implode(':', [
                    'batch',
                    $task->assignment_batch_id,
                    $task->employee_id,
                    optional($task->start_at)->toDateString(),
                ]);
            })
            ->values();

        return response()->json($tasks);
    }

    public function store(Request $request)
    {
        $request->validate([
            'supervisor_id' => 'required|exists:users,username',
            'task_definition_id' => ['required', 'integer', 'exists:task_definitions,id'],
            'due_at' => 'required|date',
            'start_at' => 'nullable|date',
            'weight_label' => ['nullable', Rule::in(array_keys(self::TASK_WEIGHTS))],
            'note' => 'nullable|string|max:5000',
        ]);

        $employer = Auth::user();
        $assignee = User::where('username', $request->supervisor_id)->firstOrFail();

        if ($employer->role_type === 'manager') {
            return response()->json([
                'message' => 'Penugasan manager ke supervisor dilakukan melalui review manager, bukan ceklis pekerjaan.'
            ], 422);
        }

        if (
            $employer->role_type !== 'supervisor'
            || !in_array($assignee->role_type, ['employee', 'crew'], true)
            || $employer->username === $assignee->username
        ) {
            return response()->json([
                'message' => 'Tidak memiliki akses. Ceklis pekerjaan hanya dapat diberikan oleh supervisor kepada crew.'
            ], 403);
        }

        $isSubordinate = $employer->subordinateLines()
            ->where('subordinate_id', $assignee->username)
            ->where('status', 'active')
            ->exists();

        if (!$isSubordinate) {
            return response()->json(['message' => 'Tidak memiliki akses. Anda hanya dapat memberi tugas kepada bawahan Anda.'], 403);
        }

        $taskDefinition = $this->activeTaskDefinition((int) $request->input('task_definition_id'));

        $dueAt = Carbon::parse($request->due_at);
        $isTodayTask = $dueAt->isSameDay(Carbon::today());
        $startAt = $isTodayTask
            ? Carbon::now()
            : ($request->filled('start_at') ? Carbon::parse($request->start_at) : Carbon::now());
        $minimumStart = Carbon::now()->startOfMinute();

        if (!$isTodayTask && $startAt->lt($minimumStart)) {
            throw ValidationException::withMessages([
                'start_at' => ['Jam mulai pekerjaan tidak boleh berada di masa lalu.'],
            ]);
        }

        if ($dueAt->lt($startAt)) {
            throw ValidationException::withMessages([
                'due_at' => ['Tenggat pekerjaan tidak boleh lebih awal dari jam mulai.'],
            ]);
        }

        if ($dueAt->isPast()) {
            throw ValidationException::withMessages([
                'due_at' => ['Tenggat pekerjaan tidak boleh berada di masa lalu.'],
            ]);
        }

        if ($this->isOutsideTaskWindow($dueAt)) {
            throw ValidationException::withMessages([
                'due_at' => ['Tanggal pekerjaan hanya dapat dibuat dalam tujuh hari berjalan.'],
            ]);
        }

        $this->validateRevisionWindow($employer, $dueAt);
        $approvalDeadline = $this->approvalDeadlineFor($employer, $dueAt);

        $weightLabel = $this->normalizeWeightLabel($request->input('weight_label'));

        $task = Task::create([
            'employee_id' => $request->supervisor_id,
            'employer_id' => $employer->username,
            ...$this->taskIdentityAttributes($taskDefinition),
            'assignment_type' => 'individual',
            'description' => $request->note,
            'start_at' => $startAt,
            'due_at' => $dueAt,
            'approval_deadline_at' => $approvalDeadline,
            'revision_deadline_at' => $this->revisionDeadlineFor($approvalDeadline),
            ...$this->taskWeightAttributes($weightLabel),
            'status' => 'pending',
        ]);

        app(UserNotificationService::class)->createAndPush(
            $task->employee_id,
            'task_created',
            'Pekerjaan Baru',
            'Anda mendapat pekerjaan baru: ' . $task->title,
            'Periksa jadwal dan detail pekerjaan Anda.',
            [
                'task_id' => $task->id,
                'url' => '/',
                'tag' => 'task-new-' . $task->id,
            ],
            'task-created-' . $task->id
        );

        return response()->json($task, 201);
    }

    public function bulkStore(Request $request)
    {
        $request->validate([
            'crew_ids' => 'required|array|min:1|max:200',
            'crew_ids.*' => 'required|exists:users,username',
            'task_definition_id' => ['required', 'integer', 'exists:task_definitions,id'],
            'note' => 'nullable|string|max:5000',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'repeat_days' => 'nullable|array|max:7',
            'repeat_days.*' => 'integer|min:0|max:6',
            'start_time' => 'required|date_format:H:i',
            'due_time' => 'required|date_format:H:i',
            'weight_label' => ['nullable', Rule::in(array_keys(self::TASK_WEIGHTS))],
        ]);

        $employer = Auth::user();
        if ($employer->role_type !== 'supervisor') {
            return response()->json(['message' => 'Penugasan massal hanya dapat dibuat oleh supervisor.'], 403);
        }

        $crewIds = collect($request->crew_ids)->unique()->values();
        $validCrewIds = $employer->subordinateLines()
            ->where('status', 'active')
            ->whereIn('subordinate_id', $crewIds)
            ->pluck('subordinate_id');

        if ($validCrewIds->count() !== $crewIds->count()) {
            return response()->json(['message' => 'Beberapa karyawan bukan bawahan aktif Anda.'], 403);
        }

        $taskDefinition = $this->activeTaskDefinition((int) $request->input('task_definition_id'));
        $taskIdentity = $this->taskIdentityAttributes($taskDefinition);
        $weightLabel = $this->normalizeWeightLabel($request->input('weight_label'));
        $repeatDays = collect($request->input('repeat_days', []))
            ->map(fn ($day) => (int) $day)
            ->unique()
            ->values();
        $startDate = Carbon::parse($request->start_date)->startOfDay();
        $endDate = Carbon::parse($request->end_date)->startOfDay();
        if ($this->isOutsideTaskWindow($endDate)) {
            return response()->json(['message' => 'Tanggal penugasan hanya dapat dibuat dalam tujuh hari berjalan.'], 422);
        }

        $dates = [];

        for ($date = $startDate->copy(); $date->lte($endDate); $date->addDay()) {
            if ($repeatDays->isNotEmpty() && !$repeatDays->contains($date->dayOfWeek)) {
                continue;
            }

            $scheduledStartAt = Carbon::parse($date->toDateString() . ' ' . $request->start_time);
            $now = Carbon::now();
            $startAt = $date->isSameDay($now) && $scheduledStartAt->lte($now)
                ? $now
                : $scheduledStartAt;
            $dueAt = Carbon::parse($date->toDateString() . ' ' . $request->due_time);

            if ($dueAt->lt($startAt)) {
                return response()->json(['message' => 'Jam selesai tidak boleh lebih awal dari jam mulai.'], 422);
            }

            if ($startAt->lt(Carbon::now()->startOfMinute())) {
                return response()->json(['message' => 'Jam mulai pekerjaan tidak boleh berada di masa lalu.'], 422);
            }

            if ($dueAt->isPast()) {
                return response()->json(['message' => 'Tenggat pekerjaan tidak boleh berada di masa lalu.'], 422);
            }

            $this->validateRevisionWindow($employer, $dueAt);

            $dates[] = [$startAt, $dueAt];
        }

        if (empty($dates)) {
            return response()->json(['message' => 'Tidak ada tanggal penugasan yang sesuai dengan pengaturan hari.'], 422);
        }

        $tasks = DB::transaction(function () use ($request, $employer, $validCrewIds, $weightLabel, $taskIdentity, $repeatDays, $startDate, $endDate, $dates) {
            $batch = TaskAssignmentBatch::create([
                'created_by' => $employer->username,
                'assignment_type' => $startDate->isSameDay($endDate) && $repeatDays->isEmpty() ? 'broadcast' : 'recurring',
                ...$taskIdentity,
                'description' => $request->note,
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'start_time' => $request->start_time,
                'due_time' => $request->due_time,
                'repeat_days' => $repeatDays->all(),
                ...$this->taskWeightAttributes($weightLabel),
                'crew_ids' => $validCrewIds->values()->all(),
            ]);

            $created = collect();
            foreach ($validCrewIds as $crewId) {
                foreach ($dates as [$startAt, $dueAt]) {
                    $approvalDeadline = $this->approvalDeadlineFor($employer, $dueAt);
                    $created->push(Task::create([
                        'employee_id' => $crewId,
                        'employer_id' => $employer->username,
                        ...$taskIdentity,
                        'assignment_batch_id' => $batch->id,
                        'assignment_type' => $batch->assignment_type,
                        'description' => $request->note,
                        'start_at' => $startAt,
                        'due_at' => $dueAt,
                        'approval_deadline_at' => $approvalDeadline,
                        'revision_deadline_at' => $this->revisionDeadlineFor($approvalDeadline),
                        ...$this->taskWeightAttributes($weightLabel),
                        'status' => 'pending',
                    ]));
                }
            }

            return $created;
        });

        $batchId = optional($tasks->first())->assignment_batch_id;
        foreach ($validCrewIds as $crewId) {
            app(UserNotificationService::class)->createAndPush(
                $crewId,
                'task_created',
                'Pekerjaan Baru',
                'Anda mendapat penugasan baru: ' . $taskDefinition->title,
                'Periksa jadwal pekerjaan yang telah dibuat untuk Anda.',
                [
                    'assignment_batch_id' => $batchId,
                    'url' => '/',
                    'tag' => 'task-bulk-' . $batchId,
                ],
                'batch-created-' . $batchId
            );
        }

        return response()->json([
            'message' => 'Penugasan massal berhasil dibuat.',
            'created' => $tasks->count(),
            'tasks' => Task::with(['evidences', 'workStation', 'assignmentBatch'])
                ->whereIn('id', $tasks->pluck('id'))
                ->orderBy('due_at', 'asc')
                ->get(),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $request->validate([
            'task_definition_id' => ['nullable', 'integer', 'exists:task_definitions,id'],
            'due_at' => 'sometimes|required|date',
            'start_at' => 'nullable|date',
            'weight_label' => ['nullable', Rule::in(array_keys(self::TASK_WEIGHTS))],
            'note' => 'nullable|string|max:5000',
        ]);

        $employer = Auth::user();
        $task = Task::with('evidences')->findOrFail($id);

        if ($task->employer_id !== $employer->username) {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        if ($task->status === 'approved' || $task->evidences->isNotEmpty()) {
            return response()->json(['message' => 'Tugas yang sudah berjalan atau disetujui tidak dapat diedit.'], 400);
        }

        $taskDefinition = $this->taskDefinitionForUpdate(
            $request->input('task_definition_id'),
            $task->task_definition_id
        );

        $dueAt = $request->filled('due_at') ? Carbon::parse($request->due_at) : Carbon::parse($task->due_at);
        $isTodayTask = $dueAt->isSameDay(Carbon::today());
        $startAt = $isTodayTask
            ? ($task->start_at ?: Carbon::now())
            : ($request->filled('start_at')
                ? Carbon::parse($request->start_at)
                : ($task->start_at ?: Carbon::parse($task->created_at)));

        if (!$isTodayTask && $request->filled('start_at') && $startAt->lt(Carbon::now()->startOfMinute())) {
            return response()->json(['message' => 'Jam mulai pekerjaan tidak boleh berada di masa lalu.'], 422);
        }

        if ($dueAt->lt($startAt)) {
            throw ValidationException::withMessages([
                'due_at' => ['Tenggat pekerjaan tidak boleh lebih awal dari jam mulai.'],
            ]);
        }

        if ($dueAt->isPast()) {
            return response()->json(['message' => 'Tenggat pekerjaan tidak boleh berada di masa lalu.'], 422);
        }

        if ($this->isOutsideTaskWindow($dueAt)) {
            return response()->json(['message' => 'Tanggal pekerjaan hanya dapat dibuat dalam tujuh hari berjalan.'], 422);
        }


        $this->validateRevisionWindow($employer, $dueAt);
        $approvalDeadline = $this->approvalDeadlineFor($employer, $dueAt);

        $weightLabel = $this->normalizeWeightLabel($request->input('weight_label', $task->weight_label));

        $task->fill([
            ...($taskDefinition ? $this->taskIdentityAttributes($taskDefinition) : []),
            'description' => $request->input('note', $task->description),
            'start_at' => $startAt,
            'due_at' => $dueAt,
            'approval_deadline_at' => $approvalDeadline,
            'revision_deadline_at' => $this->revisionDeadlineFor($approvalDeadline),
            ...$this->taskWeightAttributes($weightLabel),
        ])->save();

        app(UserNotificationService::class)->createAndPush(
            $task->employee_id,
            'task_updated',
            'Pekerjaan Diperbarui',
            'Jadwal atau detail pekerjaan "' . $task->title . '" telah diperbarui.',
            'Periksa kembali detail pekerjaan terbaru Anda.',
            [
                'task_id' => $task->id,
                'url' => '/',
                'tag' => 'task-updated-' . $task->id,
            ]
        );

        return response()->json($task->load(['evidences', 'workStation', 'assignmentBatch']));
    }

    public function updateBatch(Request $request, $id)
    {
        $request->validate([
            'crew_ids' => 'required|array|min:1|max:200',
            'crew_ids.*' => 'required|exists:users,username',
            'task_definition_id' => ['nullable', 'integer', 'exists:task_definitions,id'],
            'note' => 'nullable|string|max:5000',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'repeat_days' => 'nullable|array|max:7',
            'repeat_days.*' => 'integer|min:0|max:6',
            'start_time' => 'required|date_format:H:i',
            'due_time' => 'required|date_format:H:i',
            'weight_label' => ['nullable', Rule::in(array_keys(self::TASK_WEIGHTS))],
        ]);

        $employer = Auth::user();
        $batch = TaskAssignmentBatch::findOrFail($id);

        if ($employer->role_type !== 'supervisor' || $batch->created_by !== $employer->username) {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        $taskDefinition = $this->taskDefinitionForUpdate(
            $request->input('task_definition_id'),
            $batch->task_definition_id
        );
        $taskIdentity = $taskDefinition
            ? $this->taskIdentityAttributes($taskDefinition)
            : [
                'task_definition_id' => $batch->task_definition_id,
                'work_station_id' => $batch->work_station_id,
                'title' => $batch->title,
            ];

        $batchTasks = Task::where('assignment_batch_id', $batch->id)->with('evidences')->get();
        $previousCrewIds = $batchTasks->pluck('employee_id')->unique();
        $isProtectedTask = fn (Task $task) => $task->status === 'approved'
            || $task->evidences->isNotEmpty()
            || $this->isTaskLocked($task);
        $protectedTasks = $batchTasks->filter($isProtectedTask);
        $editableTaskIds = $batchTasks->reject($isProtectedTask)->pluck('id');
        $protectedTaskKeys = $protectedTasks->mapWithKeys(function (Task $task) {
            $taskDate = Carbon::parse($task->start_at ?: $task->due_at)->toDateString();

            return [$task->employee_id . '|' . $taskDate => true];
        });

        $crewIds = collect($request->crew_ids)->unique()->values();
        $validCrewIds = $employer->subordinateLines()
            ->where('status', 'active')
            ->whereIn('subordinate_id', $crewIds)
            ->pluck('subordinate_id');

        if ($validCrewIds->count() !== $crewIds->count()) {
            return response()->json(['message' => 'Beberapa karyawan bukan bawahan aktif Anda.'], 403);
        }

        $weightLabel = $this->normalizeWeightLabel($request->input('weight_label'));
        $repeatDays = collect($request->input('repeat_days', []))
            ->map(fn ($day) => (int) $day)
            ->unique()
            ->values();
        $startDate = Carbon::parse($request->start_date)->startOfDay();
        $endDate = Carbon::parse($request->end_date)->startOfDay();

        if ($this->isOutsideTaskWindow($endDate)) {
            return response()->json(['message' => 'Tanggal penugasan hanya dapat dibuat dalam tujuh hari berjalan.'], 422);
        }

        $dates = [];
        for ($date = $startDate->copy(); $date->lte($endDate); $date->addDay()) {
            if ($repeatDays->isNotEmpty() && !$repeatDays->contains($date->dayOfWeek)) {
                continue;
            }

            $scheduledStartAt = Carbon::parse($date->toDateString() . ' ' . $request->start_time);
            $now = Carbon::now();
            $startAt = $date->isSameDay($now) && $scheduledStartAt->lte($now)
                ? $now
                : $scheduledStartAt;
            $dueAt = Carbon::parse($date->toDateString() . ' ' . $request->due_time);

            if ($dueAt->lt($startAt)) {
                return response()->json(['message' => 'Jam selesai tidak boleh lebih awal dari jam mulai.'], 422);
            }

            if ($dueAt->isPast()) {
                continue;
            }

            $this->validateRevisionWindow($employer, $dueAt);

            $dates[] = [$startAt, $dueAt];
        }

        if (empty($dates)) {
            return response()->json(['message' => 'Tidak ada jadwal mendatang yang dapat diperbarui.'], 422);
        }

        $hasEditableTarget = $validCrewIds->contains(function ($crewId) use ($dates, $protectedTaskKeys) {
            foreach ($dates as [$startAt]) {
                if (!$protectedTaskKeys->has($crewId . '|' . $startAt->toDateString())) {
                    return true;
                }
            }

            return false;
        });

        if (!$hasEditableTarget) {
            return response()->json(['message' => 'Semua tugas pada jadwal ini sudah berjalan atau memiliki bukti dan tidak dapat diubah.'], 400);
        }

        $tasks = DB::transaction(function () use ($batch, $request, $employer, $validCrewIds, $weightLabel, $taskIdentity, $repeatDays, $startDate, $endDate, $dates, $editableTaskIds, $protectedTaskKeys) {
            if ($editableTaskIds->isNotEmpty()) {
                Task::whereIn('id', $editableTaskIds)->delete();
            }

            $batch->update([
                'assignment_type' => $startDate->isSameDay($endDate) && $repeatDays->isEmpty() ? 'broadcast' : 'recurring',
                ...$taskIdentity,
                'description' => $request->note,
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'start_time' => $request->start_time,
                'due_time' => $request->due_time,
                'repeat_days' => $repeatDays->all(),
                ...$this->taskWeightAttributes($weightLabel),
                'crew_ids' => $validCrewIds->values()->all(),
            ]);

            $created = collect();
            foreach ($validCrewIds as $crewId) {
                foreach ($dates as [$startAt, $dueAt]) {
                    if ($protectedTaskKeys->has($crewId . '|' . $startAt->toDateString())) {
                        continue;
                    }

                    $approvalDeadline = $this->approvalDeadlineFor($employer, $dueAt);
                    $created->push(Task::create([
                        'employee_id' => $crewId,
                        'employer_id' => $employer->username,
                        ...$taskIdentity,
                        'assignment_batch_id' => $batch->id,
                        'assignment_type' => $batch->assignment_type,
                        'description' => $request->note,
                        'start_at' => $startAt,
                        'due_at' => $dueAt,
                        'approval_deadline_at' => $approvalDeadline,
                        'revision_deadline_at' => $this->revisionDeadlineFor($approvalDeadline),
                        ...$this->taskWeightAttributes($weightLabel),
                        'status' => 'pending',
                    ]));
                }
            }

            return $created;
        });

        $previousCrewIds->merge($validCrewIds)->unique()->each(function ($crewId) use ($batch) {
            app(UserNotificationService::class)->createAndPush(
                $crewId,
                'task_updated',
                'Penugasan Massal Diperbarui',
                'Jadwal penugasan "' . $batch->title . '" telah diperbarui.',
                'Periksa kembali tanggal, jam, dan detail pekerjaan Anda.',
                [
                    'assignment_batch_id' => $batch->id,
                    'url' => '/',
                    'tag' => 'task-batch-updated-' . $batch->id,
                ]
            );
        });

        return response()->json([
            'message' => $protectedTasks->isEmpty()
                ? 'Penugasan massal berhasil diperbarui.'
                : 'Penugasan massal berhasil diperbarui. Tugas yang sudah berjalan atau memiliki bukti tetap dipertahankan.',
            'updated' => $tasks->count(),
            'protected' => $protectedTasks->count(),
            'tasks' => Task::with(['evidences', 'workStation', 'assignmentBatch'])
                ->where('assignment_batch_id', $batch->id)
                ->orderBy('due_at', 'asc')
                ->get(),
        ]);
    }

    public function destroy($id)
    {
        $task = Task::with('evidences')->findOrFail($id);

        if ($task->employer_id !== Auth::user()->username) {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        if ($task->assignment_batch_id) {
            $batchTasks = Task::where('assignment_batch_id', $task->assignment_batch_id)
                ->with('evidences')
                ->get();
            $batchCrewIds = $batchTasks->pluck('employee_id')->unique();
            $batchId = $task->assignment_batch_id;
            $batchTitle = $task->title;

            if ($batchTasks->contains(fn (Task $batchTask) => $batchTask->employer_id !== Auth::user()->username)) {
                return response()->json(['message' => 'Tidak memiliki akses.'], 403);
            }

            if ($batchTasks->contains(fn (Task $batchTask) => $batchTask->status === 'approved' || $batchTask->evidences->isNotEmpty() || $this->isTaskLocked($batchTask))) {
                return response()->json(['message' => 'Penugasan massal yang sudah berjalan, disetujui, atau melewati tenggat tidak dapat dihapus.'], 400);
            }

            DB::transaction(function () use ($task) {
                Task::where('assignment_batch_id', $task->assignment_batch_id)->delete();
                TaskAssignmentBatch::where('id', $task->assignment_batch_id)->delete();
            });

            $batchCrewIds->each(function ($crewId) use ($batchId, $batchTitle) {
                app(UserNotificationService::class)->createAndPush(
                    $crewId,
                    'task_deleted',
                    'Penugasan Dibatalkan',
                    'Penugasan "' . $batchTitle . '" telah dibatalkan oleh supervisor.',
                    null,
                    [
                        'assignment_batch_id' => $batchId,
                        'url' => '/',
                        'tag' => 'task-batch-deleted-' . $batchId,
                    ]
                );
            });

            return response()->json(['message' => 'Penugasan massal berhasil dihapus.']);
        }

        if ($task->status === 'approved') {
            return response()->json(['message' => 'Tugas yang sudah disetujui tidak dapat dihapus. Batalkan persetujuan terlebih dahulu jika perlu menghapus.'], 400);
        }

        if ($this->usesRevisionWorkflow($task) && !($task->review_summary['can_delete'] ?? false)) {
            return response()->json(['message' => 'Tugas yang sudah final atau berada di luar batas waktu review tidak dapat dihapus.'], 400);
        }

        if (!$this->usesRevisionWorkflow($task) && $this->isTaskLocked($task)) {
            return response()->json(['message' => 'Tugas ini sudah melewati tenggat dan tidak dapat dihapus.'], 400);
        }

        foreach ($task->evidences as $evidence) {
            if (Storage::disk('public')->exists($evidence->file_path)) {
                Storage::disk('public')->delete($evidence->file_path);
            }
        }

        $employeeId = $task->employee_id;
        $taskId = $task->id;
        $taskTitle = $task->title;
        $task->delete();

        app(UserNotificationService::class)->createAndPush(
            $employeeId,
            'task_deleted',
            'Pekerjaan Dibatalkan',
            'Pekerjaan "' . $taskTitle . '" telah dibatalkan oleh supervisor.',
            null,
            [
                'task_id' => $taskId,
                'url' => '/',
                'tag' => 'task-deleted-' . $taskId,
            ]
        );

        return response()->json(['message' => 'Tugas berhasil dihapus.']);
    }

    public function updateStatus(
        Request $request,
        $id,
        SupervisorTaskAccessService $taskAccess
    )
    {
        $request->validate([
            'status' => 'required|in:approved,pending',
            'action_date' => 'nullable|date_format:Y-m-d',
        ]);

        $task = Task::findOrFail($id);

        $reviewer = Auth::user();
        if (!$reviewer || !$taskAccess->canReviewTask($reviewer, $task, Carbon::today())) {
            return response()->json([
                'message' => 'Tidak memiliki akses. Hanya pemberi tugas atau supervisor cadangan yang sedang aktif yang dapat mengubah status tugas.'
            ], 403);
        }

        if ($response = $this->rejectNonTodayActionDate($request, $task)) {
            return $response;
        }

        if ($this->isApprovalLocked($task)) {
            return response()->json(['message' => 'Batas waktu approval tugas sudah berakhir.'], 400);
        }

        $task = DB::transaction(function () use ($id, $request, $reviewer, $taskAccess) {
            $lockedTask = Task::lockForUpdate()->findOrFail($id);

            if (!$taskAccess->canReviewTask($reviewer, $lockedTask, Carbon::today())) {
                abort(403, 'Tidak memiliki akses untuk memeriksa tugas ini.');
            }

            if ($this->isApprovalLocked($lockedTask)) {
                throw ValidationException::withMessages([
                    'status' => ['Batas waktu approval tugas sudah berakhir.'],
                ]);
            }

            if ($this->usesRevisionWorkflow($lockedTask)) {
                $latestAfter = $lockedTask->evidences()
                    ->where('type', 'after')
                    ->whereNotNull('attempt_no')
                    ->orderByDesc('attempt_no')
                    ->lockForUpdate()
                    ->first();

                if ($request->status === 'approved') {
                    $hasBefore = $lockedTask->evidences()->where('type', 'before')->exists();
                    if (!$hasBefore || !$latestAfter || $latestAfter->review_status !== 'pending') {
                        throw ValidationException::withMessages([
                            'status' => ['Tugas hanya dapat disetujui setelah bukti before dan bukti after yang menunggu pemeriksaan tersedia.'],
                        ]);
                    }

                    $latestAfter->update([
                        'review_status' => 'approved',
                        'rejection_reason' => null,
                        'reviewed_by' => $reviewer->username,
                        'reviewed_at' => Carbon::now(),
                        'awarded_score' => $this->scoreForAttempt((int) $latestAfter->attempt_no),
                    ]);
                } else {
                    if ($lockedTask->status !== 'approved' || !$latestAfter || $latestAfter->review_status !== 'approved') {
                        throw ValidationException::withMessages([
                            'status' => ['Hanya tugas yang sudah disetujui yang dapat dikembalikan ke status menunggu.'],
                        ]);
                    }

                    $latestAfter->update([
                        'review_status' => 'pending',
                        'reviewed_by' => null,
                        'reviewed_at' => null,
                        'awarded_score' => null,
                    ]);
                }
            }

            $lockedTask->status = $request->status;
            $lockedTask->save();

            return $lockedTask->load('evidences');
        });

        $statusMessages = [
            'approved' => ['Pekerjaan Disetujui', 'Pekerjaan "' . $task->title . '" telah disetujui oleh supervisor.'],
            'pending' => ['Status Pekerjaan Diperbarui', 'Persetujuan pekerjaan "' . $task->title . '" dibatalkan dan kembali menunggu pemeriksaan.'],
        ];
        [$notificationTitle, $notificationMessage] = $statusMessages[$request->status];

        app(UserNotificationService::class)->createAndPush(
            $task->employee_id,
            'task_status',
            $notificationTitle,
            $notificationMessage,
            null,
            [
                'task_id' => $task->id,
                'status' => $task->status,
                'url' => '/',
                'tag' => 'task-status-' . $task->id,
            ]
        );

        $this->refreshApprovalNotification($task->employer_id);

        return response()->json($task->load('evidences'));
    }

    public function rejectEvidence(
        Request $request,
        $id,
        SupervisorTaskAccessService $taskAccess
    ) {
        $request->validate([
            'note' => 'required|string|max:1000',
            'action_date' => 'nullable|date_format:Y-m-d',
        ]);

        $task = Task::findOrFail($id);
        $reviewer = Auth::user();

        if (!$reviewer || !$taskAccess->canReviewTask($reviewer, $task, Carbon::today())) {
            return response()->json([
                'message' => 'Tidak memiliki akses. Hanya pemberi tugas atau supervisor cadangan yang sedang aktif yang dapat menolak bukti tugas.'
            ], 403);
        }

        if ($response = $this->rejectNonTodayActionDate($request, $task)) {
            return $response;
        }

        if (!$this->usesRevisionWorkflow($task)) {
            return response()->json(['message' => 'Alur revisi tidak diterapkan pada tugas lama ini.'], 422);
        }

        $task = DB::transaction(function () use ($id, $request, $reviewer, $taskAccess) {
            $lockedTask = Task::lockForUpdate()->findOrFail($id);

            if (!$taskAccess->canReviewTask($reviewer, $lockedTask, Carbon::today())) {
                abort(403, 'Tidak memiliki akses untuk memeriksa tugas ini.');
            }

            if ($lockedTask->status === 'approved') {
                throw ValidationException::withMessages([
                    'status' => ['Tugas yang sudah disetujui harus dibatalkan ceklisnya sebelum bukti dapat ditolak.'],
                ]);
            }

            $latestAfter = $lockedTask->evidences()
                ->where('type', 'after')
                ->whereNotNull('attempt_no')
                ->orderByDesc('attempt_no')
                ->lockForUpdate()
                ->first();

            if (!$latestAfter || $latestAfter->review_status !== 'pending') {
                throw ValidationException::withMessages([
                    'status' => ['Tidak ada bukti after yang sedang menunggu pemeriksaan.'],
                ]);
            }

            $maxAttempts = (int) config('task_review.max_after_attempts', 3);
            $attemptNo = (int) $latestAfter->attempt_no;
            $rejectDeadline = $attemptNo >= $maxAttempts
                ? Carbon::parse($lockedTask->approval_deadline_at)
                : Carbon::parse($lockedTask->revision_deadline_at)
                    ->subMinutes((int) config('task_review.minimum_revision_window_minutes', 30));

            if (Carbon::now()->gt($rejectDeadline)) {
                throw ValidationException::withMessages([
                    'status' => [$attemptNo >= $maxAttempts
                        ? 'Batas waktu keputusan akhir sudah berakhir.'
                        : 'Waktu yang tersisa tidak cukup untuk memberikan kesempatan revisi.'],
                ]);
            }

            $latestAfter->update([
                'review_status' => 'rejected',
                'rejection_reason' => trim($request->note),
                'reviewed_by' => $reviewer->username,
                'reviewed_at' => Carbon::now(),
                'awarded_score' => 0,
            ]);
            $lockedTask->update(['status' => 'rejected']);

            return $lockedTask->load('evidences');
        });

        app(UserNotificationService::class)->createAndPush(
            $task->employee_id,
            'task_rejected',
            'Revisi Pekerjaan',
            'Bukti pekerjaan "' . $task->title . '" ditolak: ' . trim($request->note),
            null,
            [
                'task_id' => $task->id,
                'status' => $task->status,
                'url' => '/',
                'tag' => 'task-rejected-' . $task->id . '-' . optional($task->evidences->where('type', 'after')->sortByDesc('attempt_no')->first())->attempt_no,
            ]
        );

        $this->refreshApprovalNotification($task->employer_id);

        return response()->json($task->load('evidences'));
    }


    public function uploadEvidence(Request $request, $id)
    {
        $request->validate([
            'before' => 'nullable|array|max:1',
            'before.*' => 'nullable|file|image|mimes:jpg,jpeg,png,webp|mimetypes:image/jpeg,image/png,image/webp|max:10240',
            'after' => 'nullable|array|max:3',
            'after.*' => 'nullable|file|image|mimes:jpg,jpeg,png,webp|mimetypes:image/jpeg,image/png,image/webp|max:10240',
            'action_date' => 'nullable|date_format:Y-m-d',
        ]);

        $task = Task::with('evidences')->findOrFail($id);

        if ($task->status === 'approved') {
            return response()->json(['message' => 'Bukti pekerjaan yang sudah disetujui tidak dapat diubah. Batalkan persetujuan terlebih dahulu.'], 400);
        }

        if ($this->isTaskNotStarted($task)) {
            return response()->json(['message' => 'Pekerjaan belum memasuki jam mulai.'], 423);
        }

        if ($task->employee_id !== Auth::user()->username) {
            return response()->json(['message' => 'Tidak memiliki akses. Hanya penerima tugas yang dapat mengunggah bukti.'], 403);
        }

        if ($response = $this->rejectNonTodayActionDate($request, $task)) {
            return $response;
        }

        $authUser = Auth::user();
        if (
            $task->employee_id === $authUser->username
            && in_array($authUser->role_type, ['employee', 'crew'], true)
            && !$this->hasConfirmedGuideForTask($authUser, $task)
        ) {
            return response()->json([
                'message' => 'Silakan konfirmasi panduan hari ini sebelum mengunggah bukti tugas.'
            ], 423);
        }

        if (!$request->hasFile('before') && !$request->hasFile('after')) {
            return response()->json([
                'message' => 'Foto tidak terdeteksi atau terlalu besar (Maks 10MB).'
            ], 400);
        }

        if ($this->usesRevisionWorkflow($task)) {
            return $this->uploadRevisionEvidence($request, $task, $authUser);
        }

        if ($this->isTaskLocked($task)) {
            return response()->json(['message' => 'Tugas ini sudah melewati tenggat dan unggah bukti sudah dikunci.'], 400);
        }

        $existingBeforeCount = $task->evidences->where('type', 'before')->count();
        $existingAfterCount = $task->evidences->where('type', 'after')->count();

        if ($request->hasFile('before') && $existingBeforeCount >= 1) {
            return response()->json([
                'message' => 'Bukti sebelum bekerja dibatasi maksimal 1 foto.'
            ], 422);
        }

        if ($request->hasFile('after')) {
            $newAfterCount = count($request->file('after'));
            if (($existingAfterCount + $newAfterCount) > 3) {
                return response()->json([
                    'message' => 'Bukti sesudah bekerja dibatasi maksimal 3 foto per tugas.'
                ], 422);
            }
        }

        DB::beginTransaction();

        try {
            if ($request->hasFile('before')) {
                foreach ($request->file('before') as $file) {
                    if ($file->isValid()) {
                        $path = $file->store('tasks', 'public');
                        $task->evidences()->create([
                            'file_path' => $path,
                            'type' => 'before'
                        ]);
                    }
                }
            }

            if ($request->hasFile('after')) {
                foreach ($request->file('after') as $file) {
                    if ($file->isValid()) {
                        $path = $file->store('tasks', 'public');
                        $task->evidences()->create([
                            'file_path' => $path,
                            'type' => 'after'
                        ]);
                    }
                }
            }

            DB::commit();

            if ($authUser->username === $task->employee_id) {
                $pendingApprovalCount = $this->pendingApprovalCount($task->employer_id);

                app(UserNotificationService::class)->createOrRefreshAggregateAndPush(
                    $task->employer_id,
                    'approval-needed-' . $task->employer_id,
                    'approval_needed',
                    'Persetujuan',
                    'Anda memiliki ' . $pendingApprovalCount . ' pekerjaan yang membutuhkan persetujuan saat ini.',
                    'Pekerjaan telah dilakukan oleh bawahan Anda.',
                    [
                        'task_id' => $task->id,
                        'crew_id' => $task->employee_id,
                        'url' => '/',
                        'tag' => 'approval-needed-' . $task->employer_id,
                    ]
                );
            }

            return response()->json($task->load('evidences'));
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Terdapat kesalahan ketika mengunggah gambar. Silakan coba lagi.'], 500);
        }
    }

    private function uploadRevisionEvidence(Request $request, Task $task, User $authUser)
    {
        if ($request->hasFile('after') && count($request->file('after')) > 1) {
            return response()->json([
                'message' => 'Setiap kesempatan revisi hanya dapat mengunggah 1 foto after.'
            ], 422);
        }

        $storedPaths = [];

        try {
            $task = DB::transaction(function () use ($request, $task, &$storedPaths) {
                $lockedTask = Task::with('evidences')->lockForUpdate()->findOrFail($task->id);

                if ($lockedTask->status === 'approved') {
                    throw ValidationException::withMessages([
                        'status' => ['Bukti pekerjaan yang sudah disetujui tidak dapat diubah. Batalkan persetujuan terlebih dahulu.'],
                    ]);
                }

                $now = Carbon::now();
                $dueAt = Carbon::parse($lockedTask->due_at);
                $revisionDeadline = Carbon::parse($lockedTask->revision_deadline_at);
                $beforeEvidences = $lockedTask->evidences->where('type', 'before');
                $afterEvidences = $lockedTask->evidences
                    ->where('type', 'after')
                    ->whereNotNull('attempt_no')
                    ->sortBy('attempt_no');
                $latestAfter = $afterEvidences->last();

                if ($request->hasFile('before')) {
                    if ($now->gt($dueAt)) {
                        throw ValidationException::withMessages([
                            'before' => ['Bukti before tidak dapat diunggah setelah tenggat tugas.'],
                        ]);
                    }

                    if ($beforeEvidences->isNotEmpty()) {
                        throw ValidationException::withMessages([
                            'before' => ['Bukti sebelum bekerja dibatasi maksimal 1 foto.'],
                        ]);
                    }
                }

                $nextAttempt = null;
                if ($request->hasFile('after')) {
                    $maxAttempts = (int) config('task_review.max_after_attempts', 3);

                    if (!$latestAfter) {
                        if ($now->gt($dueAt)) {
                            throw ValidationException::withMessages([
                                'after' => ['Bukti after pertama tidak dapat diunggah setelah tenggat tugas.'],
                            ]);
                        }
                        $nextAttempt = 1;
                    } else {
                        if ($latestAfter->review_status !== 'rejected') {
                            throw ValidationException::withMessages([
                                'after' => ['Bukti after berikutnya hanya dapat diunggah setelah bukti sebelumnya ditolak.'],
                            ]);
                        }

                        $nextAttempt = (int) $latestAfter->attempt_no + 1;
                        if ($nextAttempt > $maxAttempts) {
                            throw ValidationException::withMessages([
                                'after' => ['Kesempatan unggah bukti after sudah mencapai batas maksimal.'],
                            ]);
                        }

                        if ($now->gt($revisionDeadline)) {
                            throw ValidationException::withMessages([
                                'after' => ['Batas waktu unggah revisi sudah berakhir.'],
                            ]);
                        }
                    }
                }

                if ($request->hasFile('before')) {
                    $file = $request->file('before')[0];
                    $path = $file->store('tasks', 'public');
                    $storedPaths[] = $path;
                    $lockedTask->evidences()->create([
                        'file_path' => $path,
                        'type' => 'before',
                    ]);
                }

                if ($request->hasFile('after')) {
                    $file = $request->file('after')[0];
                    $path = $file->store('tasks', 'public');
                    $storedPaths[] = $path;
                    $lockedTask->evidences()->create([
                        'file_path' => $path,
                        'type' => 'after',
                        'attempt_no' => $nextAttempt,
                        'review_status' => 'pending',
                    ]);
                    $lockedTask->update(['status' => 'pending']);
                }

                return $lockedTask->load('evidences');
            });
        } catch (ValidationException $exception) {
            foreach ($storedPaths as $path) {
                Storage::disk('public')->delete($path);
            }
            throw $exception;
        } catch (Throwable $exception) {
            foreach ($storedPaths as $path) {
                Storage::disk('public')->delete($path);
            }
            report($exception);

            return response()->json(['message' => 'Terdapat kesalahan ketika mengunggah gambar. Silakan coba lagi.'], 500);
        }

        if ($authUser->username === $task->employee_id && $request->hasFile('after')) {
            $pendingApprovalCount = $this->pendingApprovalCount($task->employer_id);

            app(UserNotificationService::class)->createOrRefreshAggregateAndPush(
                $task->employer_id,
                'approval-needed-' . $task->employer_id,
                'approval_needed',
                'Persetujuan',
                'Anda memiliki ' . $pendingApprovalCount . ' pekerjaan yang membutuhkan persetujuan saat ini.',
                'Pekerjaan telah dilakukan oleh bawahan Anda.',
                [
                    'task_id' => $task->id,
                    'crew_id' => $task->employee_id,
                    'url' => '/',
                    'tag' => 'approval-needed-' . $task->employer_id,
                ]
            );
        }

        return response()->json($task->load('evidences'));
    }

    public function readGuide(Request $request)
    {
        $request->validate([
            'role' => 'required|string',
        ]);

        $user = Auth::user();

        $workStation = $this->findWorkStationByRole($request->role);

        if (!$workStation) {
            return response()->json(['message' => 'Peran tidak valid.'], 400);
        }

        $now = now();

        $guideRead = GuideRead::firstOrCreate(
            [
                'user_id' => $user->username,
                'work_station_id' => $workStation->id,
                'read_date' => $now->toDateString(),
            ]
        );

        return response()->json([
            'message' => 'Panduan berhasil dikonfirmasi.',
            'guide_read' => $guideRead,
            'timestamp' => $now
        ]);
    }

    public function checkGuideStatus(Request $request)
    {
        $request->validate([
            'role' => 'required|string',
        ]);

        $user = Auth::user();
        $workStation = $this->findWorkStationByRole($request->role);

        if (!$workStation) {
            return response()->json(['message' => 'Peran tidak valid.'], 400);
        }

        $hasRead = GuideRead::where('user_id', $user->username)
            ->where('work_station_id', $workStation->id)
            ->where('read_date', now()->toDateString())
            ->exists();

        return response()->json(['has_read' => $hasRead]);
    }

    private function hasConfirmedGuideForDate(User $user, Carbon $date, ?string $role = null): bool
    {
        $query = GuideRead::where('user_id', $user->username)
            ->whereDate('read_date', $date->toDateString());

        if ($role) {
            $workStation = $this->findWorkStationByRole($role);
            if (!$workStation) {
                return false;
            }

            $query->where('work_station_id', $workStation->id);
        }

        return $query->exists();
    }

    private function hasConfirmedGuideForTask(User $user, Task $task): bool
    {
        if (!$task->work_station_id) {
            return $this->hasConfirmedGuideForDate($user, Carbon::today());
        }

        return GuideRead::where('user_id', $user->username)
            ->where('work_station_id', $task->work_station_id)
            ->whereDate('read_date', Carbon::today()->toDateString())
            ->exists();
    }

    private function activeTaskDefinition(int $id): TaskDefinition
    {
        $taskDefinition = TaskDefinition::with('taskArea.workStation')->find($id);

        if (!$taskDefinition || !$this->isTaskDefinitionActive($taskDefinition)) {
            throw ValidationException::withMessages([
                'task_definition_id' => ['Kategori, area, atau master task sudah tidak aktif.'],
            ]);
        }

        return $taskDefinition;
    }

    private function taskDefinitionForUpdate(mixed $requestedId, mixed $currentId): ?TaskDefinition
    {
        if (!$requestedId) {
            return null;
        }

        $taskDefinition = TaskDefinition::with('taskArea.workStation')->find((int) $requestedId);
        $isCurrentDefinition = $currentId && (int) $currentId === (int) $requestedId;

        if (!$taskDefinition || (!$isCurrentDefinition && !$this->isTaskDefinitionActive($taskDefinition))) {
            throw ValidationException::withMessages([
                'task_definition_id' => ['Kategori, area, atau master task sudah tidak aktif.'],
            ]);
        }

        return $taskDefinition;
    }

    private function isTaskDefinitionActive(TaskDefinition $taskDefinition): bool
    {
        return $taskDefinition->active
            && $taskDefinition->taskArea?->active
            && $taskDefinition->taskArea?->workStation?->active;
    }

    private function taskIdentityAttributes(TaskDefinition $taskDefinition): array
    {
        return [
            'task_definition_id' => $taskDefinition->id,
            'work_station_id' => $taskDefinition->taskArea->work_station_id,
            'title' => $taskDefinition->title,
        ];
    }

    private function findWorkStationByRole(string $role): ?WorkStation
    {
        return WorkStation::where('active', true)
            ->whereRaw('LOWER(name) = ?', [strtolower($role)])
            ->first();
    }

    private function rejectNonTodayActionDate(Request $request, Task $task)
    {
        if (!$request->filled('action_date')) {
            return null;
        }

        $actionDate = Carbon::parse($request->input('action_date'));

        if (!$actionDate->isSameDay(Carbon::today())) {
            return response()->json([
                'message' => 'Aksi pekerjaan hanya dapat dilakukan dari tampilan pekerjaan hari ini.'
            ], 422);
        }

        if (!Task::whereKey($task->id)->activeOnDate($actionDate)->exists()) {
            return response()->json([
                'message' => 'Pekerjaan ini tidak aktif pada tanggal yang dipilih.'
            ], 422);
        }

        return null;
    }

    private function isTaskLocked(Task $task): bool
    {
        return $task->due_at instanceof Carbon
            ? $task->due_at->isPast()
            : Carbon::parse($task->due_at)->isPast();
    }

    private function isApprovalLocked(Task $task): bool
    {
        $deadline = $task->approval_deadline_at
            ? ($task->approval_deadline_at instanceof Carbon
                ? $task->approval_deadline_at
                : Carbon::parse($task->approval_deadline_at))
            : $this->approvalDeadlineFor($task->createdBy, Carbon::parse($task->due_at));

        return $deadline->isPast();
    }

    private function usesRevisionWorkflow(Task $task): bool
    {
        return $task->revision_deadline_at !== null;
    }

    private function isTaskNotStarted(Task $task): bool
    {
        if (!$task->start_at) {
            return false;
        }

        return ($task->start_at instanceof Carbon ? $task->start_at : Carbon::parse($task->start_at))->isFuture();
    }

    private function normalizeWeightLabel(?string $label): ?string
    {
        $normalized = strtolower(trim((string) $label));
        if ($normalized === '') {
            return null;
        }

        return array_key_exists($normalized, self::TASK_WEIGHTS) ? $normalized : null;
    }

    private function weightValueFor(?string $label): ?int
    {
        return $label ? self::TASK_WEIGHTS[$label] : null;
    }

    private function taskWeightAttributes(?string $label): array
    {
        return $label ? [
            'weight_label' => $label,
            'weight_value' => $this->weightValueFor($label),
        ] : [];
    }

    private function isOutsideTaskWindow(Carbon $date): bool
    {
        $cutoff = Carbon::today()->addDays(6)->endOfDay();

        return $date->copy()->endOfDay()->gt($cutoff);
    }

    private function approvalDeadlineFor(?User $supervisor, Carbon $dueAt): Carbon
    {
        $deadline = $dueAt->copy()->endOfDay();

        return $supervisor?->is_back_office
            ? $deadline->addDay()
            : $deadline;
    }

    private function revisionDeadlineFor(Carbon $approvalDeadline): Carbon
    {
        return $approvalDeadline->copy()->subMinutes(
            (int) config('task_review.revision_deadline_offset_minutes', 30)
        );
    }

    private function validateRevisionWindow(User $supervisor, Carbon $dueAt): void
    {
        if ($supervisor->is_back_office) {
            return;
        }

        $latestDueAt = Carbon::parse(
            $dueAt->toDateString() . ' ' . config('task_review.normal_latest_due_time', '22:59:59')
        );

        if ($dueAt->gt($latestDueAt)) {
            throw ValidationException::withMessages([
                'due_at' => ['Tenggat tugas non-back-office maksimal pukul 22.59 agar tersedia waktu untuk reject dan revisi.'],
            ]);
        }
    }

    private function scoreForAttempt(int $attemptNo): float
    {
        return (float) config('task_review.attempt_scores.' . $attemptNo, 0);
    }

    private function pendingApprovalCount(string $supervisorId): int
    {
        return Task::where('employer_id', $supervisorId)
            ->awaitingReview()
            ->count();
    }

    private function refreshApprovalNotification(string $supervisorId): void
    {
        $pendingApprovalCount = $this->pendingApprovalCount($supervisorId);

        app(UserNotificationService::class)->refreshAggregate(
            $supervisorId,
            'approval-needed-' . $supervisorId,
            'Anda memiliki ' . $pendingApprovalCount . ' pekerjaan yang membutuhkan persetujuan saat ini.',
            [
                'url' => '/',
                'tag' => 'approval-needed-' . $supervisorId,
                'pending_count' => $pendingApprovalCount,
            ],
            $pendingApprovalCount === 0
        );
    }
}
