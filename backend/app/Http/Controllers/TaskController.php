<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use App\Models\GuideRead;
use Illuminate\Http\Request;
use App\Models\Task;
use App\Models\TaskAssignmentBatch;
use App\Models\User;
use App\Models\WorkStation;
use App\Services\UserNotificationService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TaskController extends Controller
{
    private const TASK_WEIGHTS = [
        'mudah' => 2,
        'menengah' => 6,
        'sulit' => 10,
    ];

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
            'work_station_id' => [
                'nullable',
                Rule::exists('work_stations', 'id')->where('active', true),
            ],
            'title' => 'required|string|max:255',
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

        if (!$request->filled('work_station_id')) {
            throw ValidationException::withMessages([
                'work_station_id' => ['Kategori pekerjaan wajib dipilih untuk tugas crew.'],
            ]);
        }

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

        $weightLabel = $this->normalizeWeightLabel($request->input('weight_label'));

        $task = Task::create([
            'employee_id' => $request->supervisor_id,
            'employer_id' => $employer->username,
            'work_station_id' => $request->work_station_id,
            'assignment_type' => 'individual',
            'title' => $request->title,
            'description' => $request->note,
            'start_at' => $startAt,
            'due_at' => $dueAt,
            'approval_deadline_at' => $this->approvalDeadlineFor($employer, $dueAt),
            'weight_label' => $weightLabel,
            'weight_value' => self::TASK_WEIGHTS[$weightLabel],
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
            'work_station_id' => [
                'nullable',
                Rule::exists('work_stations', 'id')->where('active', true),
            ],
            'title' => 'required|string|max:255',
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

        $weightLabel = $this->normalizeWeightLabel($request->input('weight_label'));
        $workStationId = $request->filled('work_station_id') ? $request->input('work_station_id') : null;
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

            $startAt = $date->isSameDay(Carbon::today())
                ? Carbon::now()
                : Carbon::parse($date->toDateString() . ' ' . $request->start_time);
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

            $dates[] = [$startAt, $dueAt];
        }

        if (empty($dates)) {
            return response()->json(['message' => 'Tidak ada tanggal penugasan yang sesuai dengan pengaturan hari.'], 422);
        }

        $tasks = DB::transaction(function () use ($request, $employer, $validCrewIds, $weightLabel, $workStationId, $repeatDays, $startDate, $endDate, $dates) {
            $batch = TaskAssignmentBatch::create([
                'created_by' => $employer->username,
                'assignment_type' => $startDate->isSameDay($endDate) && $repeatDays->isEmpty() ? 'broadcast' : 'recurring',
                'title' => $request->title,
                'description' => $request->note,
                'work_station_id' => $workStationId,
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'start_time' => $request->start_time,
                'due_time' => $request->due_time,
                'repeat_days' => $repeatDays->all(),
                'weight_label' => $weightLabel,
                'weight_value' => self::TASK_WEIGHTS[$weightLabel],
                'crew_ids' => $validCrewIds->values()->all(),
            ]);

            $created = collect();
            foreach ($validCrewIds as $crewId) {
                foreach ($dates as [$startAt, $dueAt]) {
                    $created->push(Task::create([
                        'employee_id' => $crewId,
                        'employer_id' => $employer->username,
                        'work_station_id' => $workStationId,
                        'assignment_batch_id' => $batch->id,
                        'assignment_type' => $batch->assignment_type,
                        'title' => $request->title,
                        'description' => $request->note,
                        'start_at' => $startAt,
                        'due_at' => $dueAt,
                        'approval_deadline_at' => $this->approvalDeadlineFor($employer, $dueAt),
                        'weight_label' => $weightLabel,
                        'weight_value' => self::TASK_WEIGHTS[$weightLabel],
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
                'Anda mendapat penugasan baru: ' . $request->title,
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
            'work_station_id' => [
                'nullable',
                Rule::exists('work_stations', 'id')->where('active', true),
            ],
            'title' => 'sometimes|required|string|max:255',
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

        $weightLabel = $this->normalizeWeightLabel($request->input('weight_label', $task->weight_label));

        $task->fill([
            'work_station_id' => $request->input('work_station_id', $task->work_station_id),
            'title' => $request->input('title', $task->title),
            'description' => $request->input('note', $task->description),
            'start_at' => $startAt,
            'due_at' => $dueAt,
            'approval_deadline_at' => $this->approvalDeadlineFor($employer, $dueAt),
            'weight_label' => $weightLabel,
            'weight_value' => self::TASK_WEIGHTS[$weightLabel],
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
            'work_station_id' => [
                'nullable',
                Rule::exists('work_stations', 'id')->where('active', true),
            ],
            'title' => 'required|string|max:255',
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
        $workStationId = $request->filled('work_station_id') ? $request->input('work_station_id') : null;
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

            $startAt = $date->isSameDay(Carbon::today())
                ? Carbon::now()
                : Carbon::parse($date->toDateString() . ' ' . $request->start_time);
            $dueAt = Carbon::parse($date->toDateString() . ' ' . $request->due_time);

            if ($dueAt->lt($startAt)) {
                return response()->json(['message' => 'Jam selesai tidak boleh lebih awal dari jam mulai.'], 422);
            }

            if ($dueAt->isPast()) {
                continue;
            }

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

        $tasks = DB::transaction(function () use ($batch, $request, $employer, $validCrewIds, $weightLabel, $workStationId, $repeatDays, $startDate, $endDate, $dates, $editableTaskIds, $protectedTaskKeys) {
            if ($editableTaskIds->isNotEmpty()) {
                Task::whereIn('id', $editableTaskIds)->delete();
            }

            $batch->update([
                'assignment_type' => $startDate->isSameDay($endDate) && $repeatDays->isEmpty() ? 'broadcast' : 'recurring',
                'title' => $request->title,
                'description' => $request->note,
                'work_station_id' => $workStationId,
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'start_time' => $request->start_time,
                'due_time' => $request->due_time,
                'repeat_days' => $repeatDays->all(),
                'weight_label' => $weightLabel,
                'weight_value' => self::TASK_WEIGHTS[$weightLabel],
                'crew_ids' => $validCrewIds->values()->all(),
            ]);

            $created = collect();
            foreach ($validCrewIds as $crewId) {
                foreach ($dates as [$startAt, $dueAt]) {
                    if ($protectedTaskKeys->has($crewId . '|' . $startAt->toDateString())) {
                        continue;
                    }

                    $created->push(Task::create([
                        'employee_id' => $crewId,
                        'employer_id' => $employer->username,
                        'work_station_id' => $workStationId,
                        'assignment_batch_id' => $batch->id,
                        'assignment_type' => $batch->assignment_type,
                        'title' => $request->title,
                        'description' => $request->note,
                        'start_at' => $startAt,
                        'due_at' => $dueAt,
                        'approval_deadline_at' => $this->approvalDeadlineFor($employer, $dueAt),
                        'weight_label' => $weightLabel,
                        'weight_value' => self::TASK_WEIGHTS[$weightLabel],
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

        if ($this->isTaskLocked($task)) {
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

    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:approved,rejected,pending',
            'action_date' => 'nullable|date_format:Y-m-d',
        ]);

        $task = Task::findOrFail($id);

        if ($task->employer_id !== Auth::user()->username) {
            return response()->json(['message' => 'Tidak memiliki akses. Hanya pemberi tugas yang dapat mengubah status tugas.'], 403);
        }

        if ($response = $this->rejectNonTodayActionDate($request, $task)) {
            return $response;
        }

        if ($this->isApprovalLocked($task)) {
            return response()->json(['message' => 'Batas waktu approval tugas sudah berakhir.'], 400);
        }

        $task->status = $request->status;
        $task->save();

        $statusMessages = [
            'approved' => ['Pekerjaan Disetujui', 'Pekerjaan "' . $task->title . '" telah disetujui oleh supervisor.'],
            'rejected' => ['Pekerjaan Ditolak', 'Pekerjaan "' . $task->title . '" ditolak. Periksa kembali hasil pekerjaan Anda.'],
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

        return response()->json($task);
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

        if ($this->isTaskLocked($task)) {
            return response()->json(['message' => 'Tugas ini sudah melewati tenggat dan unggah bukti sudah dikunci.'], 400);
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
                $pendingApprovalCount = Task::where('employer_id', $task->employer_id)
                    ->where('status', 'pending')
                    ->whereHas('evidences')
                    ->count();

                app(UserNotificationService::class)->createAndPush(
                    $task->employer_id,
                    'approval_needed',
                    'Persetujuan',
                    'Anda ada ' . $pendingApprovalCount . ' pekerjaan yang membutuhkan persetujuan saat ini.',
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

    private function isTaskNotStarted(Task $task): bool
    {
        if (!$task->start_at) {
            return false;
        }

        return ($task->start_at instanceof Carbon ? $task->start_at : Carbon::parse($task->start_at))->isFuture();
    }

    private function normalizeWeightLabel(?string $label): string
    {
        $normalized = strtolower(trim((string) ($label ?: 'mudah')));

        return array_key_exists($normalized, self::TASK_WEIGHTS) ? $normalized : 'mudah';
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
}
