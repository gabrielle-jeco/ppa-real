<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use App\Models\GuideRead;
use Illuminate\Http\Request;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkStation;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TaskController extends Controller
{
    private const APPROVAL_GRACE_HOURS = 24;

    public function index(Request $request, $supervisorId)
    {
        $user = Auth::user();
        $targetDate = $request->has('date')
            ? Carbon::parse($request->date)
            : Carbon::now();

        if ($user->role_type !== 'manager' && $user->role_type !== 'supervisor') {
            if ($user->username !== $supervisorId) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            if (!$request->filled('role')) {
                return response()->json([
                    'message' => 'Please choose a workstation before accessing your tasks.',
                    'guide_required' => true,
                ], 423);
            }

            if (
                in_array($user->role_type, ['employee', 'crew'], true)
                && $targetDate->isSameDay(Carbon::today())
                && !$this->hasConfirmedGuideForDate($user, $targetDate, $request->query('role'))
            ) {
                return response()->json([
                    'message' => 'Please confirm today\'s guide before accessing your tasks.',
                    'guide_required' => true,
                ], 423);
            }
        } else {
            if ($user->username !== $supervisorId) {
                $isSubordinate = $user->subordinateLines()->where('subordinate_id', $supervisorId)->where('status', 'active')->exists();
                if (!$isSubordinate) {
                    return response()->json(['message' => 'Unauthorized. This user is not your subordinate.'], 403);
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
                return response()->json(['message' => 'Invalid workstation'], 422);
            }

            $query->where('work_station_id', $workStation->id);
        }

        $tasks = $query->with(['evidences', 'workStation'])->orderBy('due_at', 'asc')->get();

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
            'title' => 'required|string',
            'due_at' => 'required|date',
            'note' => 'nullable|string',
        ]);

        $employer = Auth::user();
        $assignee = User::where('username', $request->supervisor_id)->firstOrFail();

        if ($employer->role_type === 'manager') {
            return response()->json([
                'message' => 'Manager-to-supervisor assignments are handled through manager review, not task checklist.'
            ], 422);
        }

        if (
            $employer->role_type !== 'supervisor'
            || !in_array($assignee->role_type, ['employee', 'crew'], true)
            || $employer->username === $assignee->username
        ) {
            return response()->json([
                'message' => 'Unauthorized. Task checklist can only be assigned by a supervisor to a crew member.'
            ], 403);
        }

        $isSubordinate = $employer->subordinateLines()
            ->where('subordinate_id', $assignee->username)
            ->where('status', 'active')
            ->exists();

        if (!$isSubordinate) {
            return response()->json(['message' => 'Unauthorized. You can only assign tasks to your direct subordinates.'], 403);
        }

        if (!$request->filled('work_station_id')) {
            throw ValidationException::withMessages([
                'work_station_id' => ['Task category is required for crew tasks.'],
            ]);
        }

        $task = Task::create([
            'employee_id' => $request->supervisor_id,
            'employer_id' => $employer->username,
            'work_station_id' => $request->work_station_id,
            'title' => $request->title,
            'description' => $request->note,
            'due_at' => $request->due_at,
            'status' => 'pending',
        ]);

        return response()->json($task, 201);
    }

    public function destroy($id)
    {
        $task = Task::with('evidences')->findOrFail($id);

        if ($task->employer_id !== Auth::user()->username) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($task->status === 'approved') {
            return response()->json(['message' => 'Cannot delete an approved task. Please un-approve it first if you must delete it.'], 400);
        }

        if ($this->isTaskLocked($task)) {
            return response()->json(['message' => 'This task is already past its deadline and can no longer be deleted.'], 400);
        }

        foreach ($task->evidences as $evidence) {
            if (Storage::disk('public')->exists($evidence->file_path)) {
                Storage::disk('public')->delete($evidence->file_path);
            }
        }

        $task->delete();
        return response()->json(['message' => 'Task deleted']);
    }

    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:approved,rejected,pending',
            'action_date' => 'nullable|date',
        ]);

        $task = Task::findOrFail($id);

        if ($task->employer_id !== Auth::user()->username) {
            return response()->json(['message' => 'Unauthorized. Only the task assigner can update its status.'], 403);
        }

        if ($response = $this->rejectNonTodayActionDate($request, $task)) {
            return $response;
        }

        if ($this->isApprovalLocked($task)) {
            return response()->json(['message' => 'Batas waktu approval tugas sudah berakhir.'], 400);
        }

        $task->status = $request->status;
        $task->save();

        return response()->json($task);
    }


    public function uploadEvidence(Request $request, $id)
    {
        $request->validate([
            'before' => 'nullable|array|max:1',
            'before.*' => 'nullable|image|max:10240',
            'after' => 'nullable|array|max:3',
            'after.*' => 'nullable|image|max:10240',
            'action_date' => 'nullable|date',
        ]);

        $task = Task::with('evidences')->findOrFail($id);

        if ($task->status === 'approved') {
            return response()->json(['message' => 'Cannot modify evidence on an approved task. Please reject/un-approve the task first.'], 400);
        }

        if ($this->isTaskLocked($task)) {
            return response()->json(['message' => 'This task is already past its deadline and evidence upload is locked.'], 400);
        }

        if ($task->employee_id !== Auth::user()->username && $task->employer_id !== Auth::user()->username) {
            return response()->json(['message' => 'Unauthorized'], 403);
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

            return response()->json($task->load('evidences'));
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Terdapat kesalahan ketika mengunggah gambar. Silakan coba lagi.'], 500);
        }
    }
    public function removeEvidence(Request $request, $id)
    {
        $request->validate([
            'evidence_id' => 'required|integer|exists:task_evidences,id'
        ]);

        $task = Task::with('evidences')->findOrFail($id);

        if ($task->status === 'approved') {
            return response()->json(['message' => 'Cannot delete evidence from an approved task. Please reject/un-approve the task first.'], 400);
        }

        if ($this->isTaskLocked($task)) {
            return response()->json(['message' => 'This task is already past its deadline and evidence can no longer be changed.'], 400);
        }

        if ($task->employee_id !== Auth::user()->username && $task->employer_id !== Auth::user()->username) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $evidence = $task->evidences()->find($request->input('evidence_id'));
        if (!$evidence) {
            return response()->json(['message' => 'Evidence not found for this task'], 404);
        }

        if ($evidence->type !== 'before') {
            return response()->json([
                'message' => 'Only before evidence can be deleted or replaced. After evidence is locked for scoring.'
            ], 400);
        }

        if (Storage::disk('public')->exists($evidence->file_path)) {
            Storage::disk('public')->delete($evidence->file_path);
        }

        $evidence->delete();

        return response()->json(['message' => 'Evidence removed', 'task' => $task->load('evidences')]);
    }

    public function readGuide(Request $request)
    {
        $request->validate([
            'role' => 'required|string',
        ]);

        $user = Auth::user();

        $workStation = $this->findWorkStationByRole($request->role);

        if (!$workStation) {
            return response()->json(['message' => 'Invalid role'], 400);
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
            'message' => 'Guide confirmed',
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
            return response()->json(['message' => 'Invalid role'], 400);
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
                'message' => 'Task actions are only allowed from today\'s task view.'
            ], 422);
        }

        if (!Task::whereKey($task->id)->activeOnDate($actionDate)->exists()) {
            return response()->json([
                'message' => 'This task is not active on the selected date.'
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
        $dueAt = $task->due_at instanceof Carbon
            ? $task->due_at
            : Carbon::parse($task->due_at);

        return $dueAt->copy()->addHours(self::APPROVAL_GRACE_HOURS)->isPast();
    }
}
