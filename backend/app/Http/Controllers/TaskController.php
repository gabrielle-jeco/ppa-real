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
use App\Services\ManagerScopeService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
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

    public function __construct(private ManagerScopeService $managerScope)
    {
    }

    protected function taskModel(): string { return Task::class; }
    protected function batchModel(): string { return TaskAssignmentBatch::class; }
    protected function isManagerTaskEndpoint(): bool { return false; }
    protected function notificationPrefix(): string { return $this->isManagerTaskEndpoint() ? 'manager-' : ''; }

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
            'role' => $this->isManagerTaskEndpoint() ? 'prohibited' : 'nullable|string|max:255',
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
                $isSubordinate = $user->role_type === 'manager'
                    ? $this->managerScope->canAccessSupervisor($user, $supervisorId)
                    : $user->subordinateLines()->where('subordinate_id', $supervisorId)->where('status', 'active')->exists();
                if (!$isSubordinate) {
                    return response()->json(['message' => 'Tidak memiliki akses. User ini bukan bawahan Anda.'], 403);
                }
            }
        }

        if ($user->role_type === 'manager') {
            abort_unless(app(\App\Services\TaskAssignmentAccessService::class)->canAssign($user, $supervisorId), 403);
        }
        if ($request->input('task_context') === 'manager_supervisor' && $user->username !== $supervisorId && $user->role_type !== 'manager') abort(403);
        $query = $this->taskModel()::where('employee_id', $supervisorId);
        if ($request->filled('task_context')) {
            $request->validate(['task_context' => 'required|in:crew,manager_supervisor']);
            abort_unless($request->task_context === ($this->isManagerTaskEndpoint() ? 'manager_supervisor' : 'crew'), 422);
        }

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

        $tasks = $query->with(['evidences', 'workStation', 'assignmentBatch', 'taskDefinition.taskArea'])
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
        $managerTask = $this->isManagerAssignment($request);
        $request->validate([
            'supervisor_id' => 'required|exists:users,username',
            'task_definition_id' => [$managerTask ? 'nullable' : 'required', 'integer', 'exists:task_definitions,id'],
            'due_at' => 'required|date',
            'start_at' => 'nullable|date',
            'weight_label' => ['nullable', Rule::in(array_keys(self::TASK_WEIGHTS))],
            'note' => 'nullable|string|max:5000',
        ]);

        $employer = Auth::user();
        $assignee = User::where('username', $request->supervisor_id)->firstOrFail();

        if (!$managerTask && $employer->role_type === 'manager') {
            return response()->json([
                'message' => 'Penugasan manager ke supervisor dilakukan melalui review manager, bukan ceklis pekerjaan.'
            ], 422);
        }

        if (!$managerTask && (
            $employer->role_type !== 'supervisor'
            || !in_array($assignee->role_type, ['employee', 'crew'], true)
            || $employer->username === $assignee->username
        )) {
            return response()->json([
                'message' => 'Tidak memiliki akses. Ceklis pekerjaan hanya dapat diberikan oleh supervisor kepada crew.'
            ], 403);
        }

        $isSubordinate = $managerTask
            ? $assignee->active && $assignee->role_type === 'supervisor'
                && app(\App\Services\TaskAssignmentAccessService::class)->canAssign($employer, $assignee->username, $request->input('location_id'))
            : $employer->subordinateLines()->where('subordinate_id', $assignee->username)->where('status', 'active')->exists();

        if (!$isSubordinate) {
            return response()->json(['message' => 'Tidak memiliki akses. Anda hanya dapat memberi tugas kepada bawahan Anda.'], 403);
        }

        $taskDefinition = $managerTask ? null : $this->activeTaskDefinition((int) $request->input('task_definition_id'));

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

        $task = $this->taskModel()::create([
            'employee_id' => $request->supervisor_id,
            'employer_id' => $employer->username,
            ...($managerTask ? $this->managerTaskIdentity($request) : $this->taskIdentityAttributes($taskDefinition)),
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
                'tag' => $this->notificationPrefix() . 'task-new-' . $task->id,
            ],
            $this->notificationPrefix() . 'task-created-' . $task->id
        );

        return response()->json($task->load(['evidences', 'workStation', 'assignmentBatch', 'taskDefinition.taskArea']), 201);
    }

    public function bulkStore(Request $request)
    {
        $managerTask = $this->isManagerAssignment($request);
        if ($managerTask) $request->merge(['crew_ids' => $request->input('supervisor_ids')]);
        $request->validate([
            'crew_ids' => 'required|array|min:1|max:200',
            'crew_ids.*' => 'required|exists:users,username',
            'task_definition_id' => [$managerTask ? 'nullable' : 'required', 'integer', 'exists:task_definitions,id'],
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
        if (!$managerTask && $employer->role_type !== 'supervisor') {
            return response()->json(['message' => 'Penugasan massal hanya dapat dibuat oleh supervisor.'], 403);
        }

        $crewIds = collect($request->crew_ids)->unique()->values();
        $validCrewIds = $managerTask
            ? app(\App\Services\TaskAssignmentAccessService::class)->recipientIds($employer, $request->input('location_id'))->intersect($crewIds)->values()
            : $employer->subordinateLines()->where('status', 'active')->whereIn('subordinate_id', $crewIds)->pluck('subordinate_id');

        if ($validCrewIds->count() !== $crewIds->count()) {
            return response()->json([
                'message' => $managerTask
                    ? 'Beberapa supervisor bukan bawahan aktif dalam cakupan Anda.'
                    : 'Beberapa karyawan bukan bawahan aktif Anda.',
            ], 403);
        }

        $taskDefinition = $managerTask ? null : $this->activeTaskDefinition((int) $request->input('task_definition_id'));
        $taskIdentity = $managerTask ? $this->managerTaskIdentity($request) : $this->taskIdentityAttributes($taskDefinition);
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
            $batch = $this->batchModel()::create([
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
                    $created->push($this->taskModel()::create([
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
                'Anda mendapat penugasan baru: ' . $taskIdentity['title'],
                'Periksa jadwal pekerjaan yang telah dibuat untuk Anda.',
                [
                    'assignment_batch_id' => $batchId,
                    'url' => '/',
                    'tag' => $this->notificationPrefix() . 'task-bulk-' . $batchId,
                ],
                $this->notificationPrefix() . 'batch-created-' . $batchId
            );
        }

        return response()->json([
            'message' => 'Penugasan massal berhasil dibuat.',
            'created' => $tasks->count(),
            'tasks' => $this->taskModel()::with(['evidences', 'workStation', 'assignmentBatch', 'taskDefinition.taskArea'])
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

        $actor = Auth::user();
        $task = $this->taskModel()::with('evidences')->findOrFail($id);

        if (!$actor || !$this->canManageTask($actor, $task)) {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        $employer = User::where('username', $task->employer_id)->firstOrFail();

        if ($task->status === 'approved' || $task->evidences->isNotEmpty()) {
            return response()->json(['message' => 'Tugas yang sudah berjalan atau disetujui tidak dapat diedit.'], 400);
        }

        if ($actor->role_type === 'manager' && $this->isTaskLocked($task)) {
            return response()->json(['message' => 'Tugas ini sudah melewati tenggat dan tidak dapat diedit.'], 400);
        }

        $managerIdentity = $task->task_context === 'manager_supervisor' ? $this->managerTaskIdentity($request) : [];
        $taskDefinition = $managerIdentity ? null : $this->taskDefinitionForUpdate(
            $request->input('task_definition_id'), $task->task_definition_id
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
            ...$managerIdentity,
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
                'tag' => $this->notificationPrefix() . 'task-updated-' . $task->id,
            ]
        );

        return response()->json($task->load(['evidences', 'workStation', 'assignmentBatch', 'taskDefinition.taskArea']));
    }

    public function updateBatch(Request $request, $id)
    {
        $existingBatch = $this->batchModel()::findOrFail($id);
        $managerTask = $existingBatch->task_context === 'manager_supervisor';
        if ($managerTask) {
            abort_unless(Auth::user()->role_type === 'manager' && $existingBatch->created_by === Auth::user()->username, 403);
            $request->merge(['task_context' => 'manager_supervisor', 'crew_ids' => $request->input('supervisor_ids')]);
            $this->isManagerAssignment($request);
            foreach ($existingBatch->tasks as $existingTask) abort_unless($this->canManageTask(Auth::user(), $existingTask), 403);
        }
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
        $batch = $this->batchModel()::findOrFail($id);

        if ((!$managerTask && $employer->role_type !== 'supervisor') || $batch->created_by !== $employer->username) {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        $taskDefinition = $managerTask ? null : $this->taskDefinitionForUpdate(
            $request->input('task_definition_id'), $batch->task_definition_id
        );
        $taskIdentity = $managerTask ? $this->managerTaskIdentity($request) : ($taskDefinition
            ? $this->taskIdentityAttributes($taskDefinition)
            : [
                'task_definition_id' => $batch->task_definition_id,
                'work_station_id' => $batch->work_station_id,
                'title' => $batch->title,
            ]);

        $batchTasks = $this->taskModel()::where('assignment_batch_id', $batch->id)->with('evidences')->get();
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
        $validCrewIds = $managerTask
            ? app(\App\Services\TaskAssignmentAccessService::class)->recipientIds($employer, $request->input('location_id'))->intersect($crewIds)->values()
            : $employer->subordinateLines()->where('status', 'active')->whereIn('subordinate_id', $crewIds)->pluck('subordinate_id');

        if ($validCrewIds->count() !== $crewIds->count()) {
            return response()->json([
                'message' => $managerTask
                    ? 'Beberapa supervisor bukan bawahan aktif dalam cakupan Anda.'
                    : 'Beberapa karyawan bukan bawahan aktif Anda.',
            ], 403);
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
                $this->taskModel()::whereIn('id', $editableTaskIds)->delete();
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
                    $created->push($this->taskModel()::create([
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
                    'tag' => $this->notificationPrefix() . 'task-batch-updated-' . $batch->id,
                ]
            );
        });

        return response()->json([
            'message' => $protectedTasks->isEmpty()
                ? 'Penugasan massal berhasil diperbarui.'
                : 'Penugasan massal berhasil diperbarui. Tugas yang sudah berjalan atau memiliki bukti tetap dipertahankan.',
            'updated' => $tasks->count(),
            'protected' => $protectedTasks->count(),
            'tasks' => $this->taskModel()::with(['evidences', 'workStation', 'assignmentBatch', 'taskDefinition.taskArea'])
                ->where('assignment_batch_id', $batch->id)
                ->orderBy('due_at', 'asc')
                ->get(),
        ]);
    }

    public function destroy($id)
    {
        $task = $this->taskModel()::with('evidences')->findOrFail($id);

        $actor = Auth::user();
        if (!$actor || !$this->canManageTask($actor, $task)) {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        $actorLabel = $this->isManagerTaskEndpoint() ? 'manager' : 'supervisor';

        if ($task->assignment_batch_id) {
            $batchTasks = $this->taskModel()::where('assignment_batch_id', $task->assignment_batch_id)
                ->with('evidences')
                ->get();
            $batchCrewIds = $batchTasks->pluck('employee_id')->unique();
            $batchId = $task->assignment_batch_id;
            $batchTitle = $task->title;

            if ($batchTasks->contains(fn (Task $batchTask) => !$this->canManageTask($actor, $batchTask))) {
                return response()->json(['message' => 'Tidak memiliki akses.'], 403);
            }

            if ($batchTasks->contains(fn (Task $batchTask) => $batchTask->status === 'approved' || $batchTask->evidences->isNotEmpty() || $this->isTaskLocked($batchTask))) {
                return response()->json(['message' => 'Penugasan massal yang sudah berjalan, disetujui, atau melewati tenggat tidak dapat dihapus.'], 400);
            }

            DB::transaction(function () use ($task) {
                $this->taskModel()::where('assignment_batch_id', $task->assignment_batch_id)->delete();
                $this->batchModel()::where('id', $task->assignment_batch_id)->delete();
            });

            $batchCrewIds->each(function ($crewId) use ($batchId, $batchTitle, $actorLabel) {
                app(UserNotificationService::class)->createAndPush(
                    $crewId,
                    'task_deleted',
                    'Penugasan Dibatalkan',
                    'Penugasan "' . $batchTitle . '" telah dibatalkan oleh ' . $actorLabel . '.',
                    null,
                    [
                        'assignment_batch_id' => $batchId,
                        'url' => '/',
                        'tag' => $this->notificationPrefix() . 'task-batch-deleted-' . $batchId,
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
            if (Storage::disk($task->task_context === 'manager_supervisor' ? 'local' : 'public')->exists($evidence->file_path)) {
                Storage::disk($task->task_context === 'manager_supervisor' ? 'local' : 'public')->delete($evidence->file_path);
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
            'Pekerjaan "' . $taskTitle . '" telah dibatalkan oleh ' . $actorLabel . '.',
            null,
            [
                'task_id' => $taskId,
                'url' => '/',
                'tag' => $this->notificationPrefix() . 'task-deleted-' . $taskId,
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

        $task = $this->taskModel()::findOrFail($id);

        $reviewer = Auth::user();
        if (!$reviewer || !$taskAccess->canReviewTask($reviewer, $task, Carbon::today())) {
            return response()->json([
                'message' => $task->task_context === 'manager_supervisor'
                    ? 'Tidak memiliki akses. Hanya manager yang berwenang atas cabang supervisor ini yang dapat mengubah status tugas.'
                    : 'Tidak memiliki akses. Hanya pemberi tugas, atasan permanen aktif, atau supervisor cadangan yang sedang aktif yang dapat mengubah status tugas.'
            ], 403);
        }

        if ($response = $this->rejectNonTodayActionDate($request, $task)) {
            return $response;
        }

        if ($this->isApprovalLocked($task)) {
            return response()->json(['message' => 'Batas waktu approval tugas sudah berakhir.'], 400);
        }

        $task = DB::transaction(function () use ($id, $request, $reviewer, $taskAccess) {
            $lockedTask = $this->taskModel()::lockForUpdate()->findOrFail($id);

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
                    $hasBefore = $lockedTask->task_context === 'manager_supervisor' || $lockedTask->evidences()->where('type', 'before')->exists();
                    if (!$hasBefore || !$latestAfter || $latestAfter->review_status !== 'pending') {
                        throw ValidationException::withMessages([
                            'status' => [
                                $lockedTask->task_context === 'manager_supervisor'
                                    ? 'Tugas hanya dapat disetujui setelah bukti tugas yang menunggu pemeriksaan tersedia.'
                                    : 'Tugas hanya dapat disetujui setelah bukti before dan bukti after yang menunggu pemeriksaan tersedia.',
                            ],
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

        $approverLabel = $task->task_context === 'manager_supervisor' ? 'manager' : 'supervisor';
        $statusMessages = [
            'approved' => ['Pekerjaan Disetujui', 'Pekerjaan "' . $task->title . '" telah disetujui oleh ' . $approverLabel . '.'],
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
                'tag' => $this->notificationPrefix() . 'task-status-' . $task->id,
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

        $task = $this->taskModel()::findOrFail($id);
        $reviewer = Auth::user();

        if (!$reviewer || !$taskAccess->canReviewTask($reviewer, $task, Carbon::today())) {
            return response()->json([
                'message' => $task->task_context === 'manager_supervisor'
                    ? 'Tidak memiliki akses. Hanya manager yang berwenang atas cabang supervisor ini yang dapat menolak bukti tugas.'
                    : 'Tidak memiliki akses. Hanya pemberi tugas, atasan permanen aktif, atau supervisor cadangan yang sedang aktif yang dapat menolak bukti tugas.'
            ], 403);
        }

        if ($response = $this->rejectNonTodayActionDate($request, $task)) {
            return $response;
        }

        if (!$this->usesRevisionWorkflow($task)) {
            return response()->json(['message' => 'Alur revisi tidak diterapkan pada tugas lama ini.'], 422);
        }

        $task = DB::transaction(function () use ($id, $request, $reviewer, $taskAccess) {
            $lockedTask = $this->taskModel()::lockForUpdate()->findOrFail($id);

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
                    'status' => [
                        $lockedTask->task_context === 'manager_supervisor'
                            ? 'Tidak ada bukti tugas yang sedang menunggu pemeriksaan.'
                            : 'Tidak ada bukti after yang sedang menunggu pemeriksaan.',
                    ],
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
                'tag' => $this->notificationPrefix() . 'task-rejected-' . $task->id . '-' . optional($task->evidences->where('type', 'after')->sortByDesc('attempt_no')->first())->attempt_no,
            ]
        );

        $this->refreshApprovalNotification($task->employer_id);

        return response()->json($task->load('evidences'));
    }


    public function uploadEvidence(Request $request, $id)
    {
        $evidenceTask = $this->taskModel()::findOrFail($id);
        $managerEvidence = $evidenceTask->task_context === 'manager_supervisor';
        if ($managerEvidence) {
            abort_unless(Auth::user()->active && $evidenceTask->employee_id === Auth::user()->username && Auth::user()->role_type === 'supervisor', 403);
            $request->validate([
                'before' => 'prohibited', 'after' => 'required|array|size:1',
                'after.*' => 'required|file|mimes:jpg,jpeg,png,webp,xlsx|max:10240',
                'action_date' => 'nullable|date_format:Y-m-d',
            ]);
            $file = $request->file('after')[0];
            if (strtolower($file->getClientOriginalExtension()) === 'xlsx') {
                if (!class_exists(\ZipArchive::class)) {
                    Log::error('XLSX upload validation unavailable: PHP zip extension is not enabled.');
                    return $this->evidenceUploadError(
                        $request,
                        $evidenceTask,
                        'XLSX_EXTENSION_UNAVAILABLE',
                        'Unggah file XLSX sementara tidak tersedia karena ekstensi server belum aktif.',
                        503
                    );
                }
                $zip = new \ZipArchive();
                $opened = $zip->open($file->getRealPath()) === true;
                $valid = $opened && $zip->locateName('[Content_Types].xml') !== false && $zip->locateName('xl/workbook.xml') !== false;
                if ($opened) $zip->close();
                if (!$valid) throw ValidationException::withMessages(['after' => ['File XLSX tidak valid.']]);
            } elseif (!@getimagesize($file->getRealPath())) {
                throw ValidationException::withMessages(['after' => ['Bukti harus berupa foto atau XLSX.']]);
            }
        } else {
            $request->validate([
                'before' => 'nullable|array|max:1',
            'before.*' => 'nullable|file|image|mimes:jpg,jpeg,png,webp|mimetypes:image/jpeg,image/png,image/webp|max:10240',
            'after' => 'nullable|array|max:3',
            'after.*' => 'nullable|file|image|mimes:jpg,jpeg,png,webp|mimetypes:image/jpeg,image/png,image/webp|max:10240',
            'action_date' => 'nullable|date_format:Y-m-d',
        ]);
        }

        $task = $this->taskModel()::with('evidences')->findOrFail($id);

        if ($task->status === 'approved') {
            return $this->evidenceUploadError(
                $request,
                $task,
                'TASK_ALREADY_APPROVED',
                'Bukti pekerjaan yang sudah disetujui tidak dapat diubah. Batalkan persetujuan terlebih dahulu.',
                400
            );
        }

        if ($this->isTaskNotStarted($task)) {
            return $this->evidenceUploadError($request, $task, 'TASK_NOT_STARTED', 'Pekerjaan belum memasuki jam mulai.', 423);
        }

        if ($task->employee_id !== Auth::user()->username) {
            return $this->evidenceUploadError(
                $request,
                $task,
                'TASK_UPLOAD_FORBIDDEN',
                'Tidak memiliki akses. Hanya penerima tugas yang dapat mengunggah bukti.',
                403,
                false
            );
        }

        if ($response = $this->rejectNonTodayActionDate($request, $task, true)) {
            return $response;
        }

        $authUser = Auth::user();
        if (
            $task->employee_id === $authUser->username
            && in_array($authUser->role_type, ['employee', 'crew'], true)
            && !$this->hasConfirmedGuideForTask($authUser, $task)
        ) {
            return $this->evidenceUploadError(
                $request,
                $task,
                'GUIDE_NOT_CONFIRMED',
                'Silakan konfirmasi panduan hari ini sebelum mengunggah bukti tugas.',
                423
            );
        }

        if (!$request->hasFile('before') && !$request->hasFile('after')) {
            return $this->evidenceUploadError(
                $request,
                $task,
                'EVIDENCE_FILE_MISSING',
                $managerEvidence
                    ? 'File bukti tidak terdeteksi atau terlalu besar (Maks 10MB).'
                    : 'Foto tidak terdeteksi atau terlalu besar (Maks 10MB).',
                400
            );
        }

        if ($this->usesRevisionWorkflow($task)) {
            return $this->uploadRevisionEvidence($request, $task, $authUser);
        }

        if ($this->isTaskLocked($task)) {
            return $this->evidenceUploadError(
                $request,
                $task,
                'TASK_DUE_PASSED',
                'Tugas ini sudah melewati tenggat dan unggah bukti sudah dikunci.',
                400
            );
        }

        $existingBeforeCount = $task->evidences->where('type', 'before')->count();
        $existingAfterCount = $task->evidences->where('type', 'after')->count();

        if ($request->hasFile('before') && $existingBeforeCount >= 1) {
            return $this->evidenceUploadError(
                $request,
                $task,
                'BEFORE_EVIDENCE_LIMIT_REACHED',
                'Bukti sebelum bekerja dibatasi maksimal 1 foto.',
                422
            );
        }

        if ($request->hasFile('after')) {
            $newAfterCount = count($request->file('after'));
            if (($existingAfterCount + $newAfterCount) > 3) {
                return $this->evidenceUploadError(
                    $request,
                    $task,
                    'AFTER_EVIDENCE_LIMIT_REACHED',
                    'Bukti sesudah bekerja dibatasi maksimal 3 foto per tugas.',
                    422
                );
            }
        }

        $storedPaths = [];

        DB::beginTransaction();

        try {
            if ($request->hasFile('before')) {
                foreach ($request->file('before') as $file) {
                    if ($file->isValid()) {
                        $path = $file->store('tasks', 'public');
                        $storedPaths[] = $path;
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
                        $storedPaths[] = $path;
                        $task->evidences()->create([
                            'file_path' => $path,
                            'type' => 'after'
                        ]);
                    }
                }
            }

            DB::commit();
        } catch (Throwable $e) {
            DB::rollBack();
            foreach ($storedPaths as $path) {
                Storage::disk('public')->delete($path);
            }
            report($e);

            return $this->evidenceUploadError(
                $request,
                $task,
                'EVIDENCE_UPLOAD_FAILED',
                $managerEvidence
                    ? 'Terdapat kesalahan ketika mengunggah bukti. Silakan coba lagi.'
                    : 'Terdapat kesalahan ketika mengunggah gambar. Silakan coba lagi.',
                500
            );
        }

        if ($authUser->username === $task->employee_id) {
            try {
                $pendingApprovalCount = $this->pendingApprovalCount($task->employer_id);

                app(UserNotificationService::class)->createOrRefreshAggregateAndPush(
                    $task->employer_id,
                    $this->notificationPrefix() . 'approval-needed-' . $task->employer_id,
                    'approval_needed',
                    'Persetujuan',
                    'Anda memiliki ' . $pendingApprovalCount . ' pekerjaan yang membutuhkan persetujuan saat ini.',
                    'Pekerjaan telah dilakukan oleh bawahan Anda.',
                    [
                        'task_id' => $task->id,
                        'crew_id' => $task->employee_id,
                        'url' => '/',
                        'tag' => $this->notificationPrefix() . 'approval-needed-' . $task->employer_id,
                    ]
                );
            } catch (Throwable $notificationException) {
                report($notificationException);
            }
        }

        return response()->json($task->load('evidences'));
    }

    private function uploadRevisionEvidence(Request $request, Task $task, User $authUser)
    {
        $isManagerTask = $task->task_context === 'manager_supervisor';

        if ($request->hasFile('after') && count($request->file('after')) > 1) {
            return response()->json([
                'message' => $isManagerTask
                    ? 'Setiap kesempatan revisi hanya dapat mengunggah 1 file bukti.'
                    : 'Setiap kesempatan revisi hanya dapat mengunggah 1 foto after.'
            ], 422);
        }

        $storedPaths = [];
        $disk = $isManagerTask ? 'local' : 'public';

        try {
            $task = DB::transaction(function () use ($request, $task, &$storedPaths, $disk, $isManagerTask) {
                $lockedTask = $this->taskModel()::with('evidences')->lockForUpdate()->findOrFail($task->id);

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
                                'after' => [
                                    $isManagerTask
                                        ? 'Bukti tugas pertama tidak dapat diunggah setelah tenggat tugas.'
                                        : 'Bukti after pertama tidak dapat diunggah setelah tenggat tugas.',
                                ],
                            ]);
                        }
                        $nextAttempt = 1;
                    } else {
                        if ($latestAfter->review_status !== 'rejected') {
                            throw ValidationException::withMessages([
                                'after' => [
                                    $isManagerTask
                                        ? 'Bukti tugas berikutnya hanya dapat diunggah setelah bukti sebelumnya ditolak.'
                                        : 'Bukti after berikutnya hanya dapat diunggah setelah bukti sebelumnya ditolak.',
                                ],
                            ]);
                        }

                        $nextAttempt = (int) $latestAfter->attempt_no + 1;
                        if ($nextAttempt > $maxAttempts) {
                            throw ValidationException::withMessages([
                                'after' => [
                                    $isManagerTask
                                        ? 'Kesempatan unggah bukti tugas sudah mencapai batas maksimal.'
                                        : 'Kesempatan unggah bukti after sudah mencapai batas maksimal.',
                                ],
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
                    $path = $file->store('tasks', $disk);
                    $storedPaths[] = $path;
                    $lockedTask->evidences()->create([
                        'file_path' => $path,
                        'type' => 'before',
                    ]);
                }

                if ($request->hasFile('after')) {
                    $file = $request->file('after')[0];
                    $path = $file->store('tasks', $disk);
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
                Storage::disk($disk)->delete($path);
            }

            $errors = $exception->errors();
            $message = collect($errors)->flatten()->first() ?: 'Unggah bukti ditolak.';

            return $this->evidenceUploadError(
                $request,
                $task,
                'EVIDENCE_UPLOAD_REJECTED',
                $message,
                422,
                true,
                $errors
            );
        } catch (Throwable $exception) {
            foreach ($storedPaths as $path) {
                Storage::disk($disk)->delete($path);
            }
            report($exception);

            return $this->evidenceUploadError(
                $request,
                $task,
                'EVIDENCE_UPLOAD_FAILED',
                $isManagerTask
                    ? 'Terdapat kesalahan ketika mengunggah bukti. Silakan coba lagi.'
                    : 'Terdapat kesalahan ketika mengunggah gambar. Silakan coba lagi.',
                500
            );
        }

        if ($authUser->username === $task->employee_id && $request->hasFile('after')) {
            $pendingApprovalCount = $this->pendingApprovalCount($task->employer_id);

            app(UserNotificationService::class)->createOrRefreshAggregateAndPush(
                $task->employer_id,
                $this->notificationPrefix() . 'approval-needed-' . $task->employer_id,
                'approval_needed',
                'Persetujuan',
                'Anda memiliki ' . $pendingApprovalCount . ' pekerjaan yang membutuhkan persetujuan saat ini.',
                'Pekerjaan telah dilakukan oleh bawahan Anda.',
                [
                    'task_id' => $task->id,
                    'crew_id' => $task->employee_id,
                    'url' => '/',
                    'tag' => $this->notificationPrefix() . 'approval-needed-' . $task->employer_id,
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

    private function rejectNonTodayActionDate(Request $request, Task $task, bool $forEvidenceUpload = false)
    {
        if (!$request->filled('action_date')) {
            return null;
        }

        $actionDate = Carbon::parse($request->input('action_date'));

        if (!$actionDate->isSameDay(Carbon::today())) {
            if ($forEvidenceUpload) {
                return $this->evidenceUploadError(
                    $request,
                    $task,
                    'TASK_ACTION_DATE_NOT_TODAY',
                    'Aksi pekerjaan hanya dapat dilakukan dari tampilan pekerjaan hari ini.',
                    422
                );
            }

            return response()->json([
                'message' => 'Aksi pekerjaan hanya dapat dilakukan dari tampilan pekerjaan hari ini.'
            ], 422);
        }

        if (!$this->taskModel()::whereKey($task->id)->activeOnDate($actionDate)->exists()) {
            if ($forEvidenceUpload) {
                return $this->evidenceUploadError(
                    $request,
                    $task,
                    'TASK_NOT_ACTIVE_ON_DATE',
                    'Pekerjaan ini tidak aktif pada tanggal yang dipilih.',
                    422
                );
            }

            return response()->json([
                'message' => 'Pekerjaan ini tidak aktif pada tanggal yang dipilih.'
            ], 422);
        }

        return null;
    }

    private function evidenceUploadError(
        Request $request,
        Task $task,
        string $errorCode,
        string $message,
        int $status,
        bool $includeTaskTiming = true,
        array $errors = []
    ) {
        $referenceId = Str::upper(Str::random(10));
        $serverNow = Carbon::now();
        $timing = [
            'start_at' => $task->start_at ? Carbon::parse($task->start_at)->toISOString() : null,
            'due_at' => $task->due_at ? Carbon::parse($task->due_at)->toISOString() : null,
        ];

        Log::warning('Task evidence upload rejected', [
            'reference_id' => $referenceId,
            'error_code' => $errorCode,
            'message' => $message,
            'http_status' => $status,
            'task_id' => $task->id,
            'user_id' => optional(Auth::user())->username,
            'server_time' => $serverNow->toISOString(),
            'action_date' => $request->input('action_date'),
            ...$timing,
        ]);

        $payload = [
            'message' => $message,
            'error_code' => $errorCode,
            'reference_id' => $referenceId,
            'task_id' => $task->id,
            'server_time' => $serverNow->toISOString(),
        ];

        if ($includeTaskTiming) {
            $payload = [...$payload, ...$timing];
        }

        if ($errors !== []) {
            $payload['errors'] = $errors;
        }

        return response()->json($payload, $status);
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


    public function downloadEvidence($taskId, $evidenceId)
    {
        $task = $this->taskModel()::findOrFail($taskId);
        abort_unless($task->task_context === 'manager_supervisor' && app(\App\Services\TaskAssignmentAccessService::class)->canRead(Auth::user(), $task), 403);
        $evidence = $task->evidences()->findOrFail($evidenceId);
        abort_unless(Storage::disk('local')->exists($evidence->file_path), 404);
        return Storage::disk('local')->download($evidence->file_path, 'bukti-' . $evidence->id . '.' . pathinfo($evidence->file_path, PATHINFO_EXTENSION), ['X-Content-Type-Options'=>'nosniff']);
    }

    private function isManagerAssignment(Request $request): bool
    {
        $request->validate(['task_context' => 'nullable|in:crew,manager_supervisor', 'location_id'=>'nullable|string|max:255']);
        if (!$this->isManagerTaskEndpoint()) {
            abort_if($request->input('task_context') === 'manager_supervisor', 422, 'Gunakan endpoint penugasan Manager.');
            return false;
        }
        $request->validate(['task_context' => 'nullable|in:manager_supervisor']);
        abort_unless(Auth::user()->active && Auth::user()->role_type === 'manager', 403);
        $this->managerTaskIdentity($request);
        return true;
    }

    private function managerTaskIdentity(Request $request): array
    {
        $request->validate(['title'=>'required|string|max:255', 'target'=>'required|string|max:5000']);
        return ['target'=>$request->target, 'title'=>$request->title];
    }

    private function canManageTask(User $actor, Task $task): bool
    {
        if ($task->task_context === 'manager_supervisor') return app(\App\Services\TaskAssignmentAccessService::class)->canManage($actor, $task);
        if ($task->employer_id === $actor->username) {
            return true;
        }

        return $actor->role_type === 'manager'
            && $this->managerScope->canAccessSupervisor($actor, $task->employer_id);
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
        if ($this->isManagerTaskEndpoint()) return [];
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
        return $this->taskModel()::where('employer_id', $supervisorId)
            ->awaitingReview()
            ->count();
    }

    private function refreshApprovalNotification(string $supervisorId): void
    {
        $pendingApprovalCount = $this->pendingApprovalCount($supervisorId);

        app(UserNotificationService::class)->refreshAggregate(
            $supervisorId,
            $this->notificationPrefix() . 'approval-needed-' . $supervisorId,
            'Anda memiliki ' . $pendingApprovalCount . ' pekerjaan yang membutuhkan persetujuan saat ini.',
            [
                'url' => '/',
                'tag' => $this->notificationPrefix() . 'approval-needed-' . $supervisorId,
                'pending_count' => $pendingApprovalCount,
            ],
            $pendingApprovalCount === 0
        );
    }
}
