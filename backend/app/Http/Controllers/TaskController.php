<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Task;
use App\Models\User;
use App\Models\GuideRead;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class TaskController extends Controller
{
    /**
     * Get tasks for a specific supervisor.
     * Route: GET /api/supervisor/{id}/tasks
     */
    public function index(Request $request, $supervisorId)
    {
        $user = Auth::user();

        // Security check: Only Managers/Supervisors can view tasks assigned to others
        if ($user->role_type !== 'manager' && $user->role_type !== 'supervisor') {
            if ($user->id != $supervisorId) { // Prevent Crews from viewing other Crew's tasks
                return response()->json(['message' => 'Unauthorized'], 403);
            }
        } else {
            // If it's a Manager/Supervisor trying to view someone else's tasks, verify hierarchy
            if ($user->id != $supervisorId) {
                // Ensure the requested $supervisorId is a valid subordinate
                $isSubordinate = $user->subordinateLines()->where('subordinate_id', $supervisorId)->where('status', 'active')->exists();
                if (!$isSubordinate) {
                    return response()->json(['message' => 'Unauthorized. This user is not your subordinate.'], 403);
                }
            }
        }

        $query = Task::where('employee_id', $supervisorId);

        if ($request->has('date')) {
            $query->whereDate('due_at', $request->date);
        }

        $tasks = $query->with('evidences')->orderBy('due_at', 'asc')->get();

        return response()->json($tasks);
    }

    /**
     * Create a new task.
     * Route: POST /api/tasks
     */
    public function store(Request $request)
    {
        $request->validate([
            'supervisor_id' => 'required|exists:users,id',
            'title' => 'required|string',
            'due_at' => 'required|date',
            'note' => 'nullable|string',
        ]);

        $employer = Auth::user();

        // Hierarchy Check: Prevent user from creating tasks for someone who is not their subordinate
        if ($employer->id != $request->supervisor_id) { // Allow self-assigned tasks for Supervisor's own checklist
            $isSubordinate = $employer->subordinateLines()->where('subordinate_id', $request->supervisor_id)->where('status', 'active')->exists();
            if (!$isSubordinate) {
                return response()->json(['message' => 'Unauthorized. You can only assign tasks to your direct subordinates.'], 403);
            }
        }

        $task = Task::create([
            'employee_id' => $request->supervisor_id, // Who is doing the task
            'employer_id' => Auth::id(), // Who assigned the task
            'title' => $request->title,
            'description' => $request->note,
            'due_at' => $request->due_at,
            'status' => 'pending',
        ]);

        return response()->json($task, 201);
    }

    /**
     * Delete a task.
     */
    public function destroy($id)
    {
        $task = Task::with('evidences')->findOrFail($id);

        // Only the creator (employer) can delete a task
        if ($task->employer_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Prevent deletion of approved tasks to maintain historical/audit consistency
        if ($task->status === 'approved') {
            return response()->json(['message' => 'Cannot delete an approved task. Please un-approve it first if you must delete it.'], 400);
        }

        // Delete all physical evidence files before deleting the task
        foreach ($task->evidences as $evidence) {
            if (\Illuminate\Support\Facades\Storage::disk('public')->exists($evidence->file_path)) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($evidence->file_path);
            }
        }

        $task->delete();
        return response()->json(['message' => 'Task deleted']);
    }

    /**
     * Update task status (Approve/Reject).
     */
    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:approved,rejected,pending'
        ]);

        $task = Task::findOrFail($id);

        if ($task->employer_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized. Only the task assigner can update its status.'], 403);
        }

        $task->status = $request->status;
        $task->save();

        return response()->json($task);
    }


    /**
     * Upload evidence (Before/After photos) for a task.
     * Route: POST /api/tasks/{id}/evidence
     */
    public function uploadEvidence(Request $request, $id)
    {
        $request->validate([
            'before.*' => 'nullable|image|max:10240', // Max 10MB per file
            'after.*' => 'nullable|image|max:10240',
        ]);

        $task = Task::findOrFail($id);

        if ($task->status === 'approved') {
            return response()->json(['message' => 'Cannot modify evidence on an approved task. Please reject/un-approve the task first.'], 400);
        }

        // Security check: Ensure the authenticated user is the one assigned to the task
        // But also allow Supervisors to upload evidence on tasks they assigned
        if ($task->employee_id !== Auth::id() && $task->employer_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (!$request->hasFile('before') && !$request->hasFile('after')) {
            return response()->json([
                'message' => 'Foto tidak terdeteksi atau terlalu besar (Maks 10MB).'
            ], 400);
        }

        // Explicitly start a transaction to ensure all files or no files are saved
        \Illuminate\Support\Facades\DB::beginTransaction();

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

            // Do not update status here; status remains pending until approved by supervisor.
            \Illuminate\Support\Facades\DB::commit();

            return response()->json($task->load('evidences'));
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\DB::rollBack();
            return response()->json(['message' => 'Terdapat kesalahan ketika mengunggah gambar. Silakan coba lagi.'], 500);
        }
    }
    /**
     * Remove evidence image (before/after) from a task.
     * Route: DELETE /api/tasks/{id}/evidence
     */
    public function removeEvidence(Request $request, $id)
    {
        $request->validate([
            'evidence_id' => 'required|integer|exists:task_evidences,id'
        ]);

        $task = Task::findOrFail($id);

        if ($task->status === 'approved') {
            return response()->json(['message' => 'Cannot delete evidence from an approved task. Please reject/un-approve the task first.'], 400);
        }

        // Security check: Ensure the authenticated user is authorized to delete
        if ($task->employee_id !== Auth::id() && $task->employer_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $evidence = $task->evidences()->find($request->input('evidence_id'));
        if (!$evidence) {
            return response()->json(['message' => 'Evidence not found for this task'], 404);
        }

        // Delete physical file
        if (\Illuminate\Support\Facades\Storage::disk('public')->exists($evidence->file_path)) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($evidence->file_path);
        }

        $evidence->delete();

        return response()->json(['message' => 'Evidence removed', 'task' => $task->load('evidences')]);
    }

    /**
     * Confirm reading the guide for a specific workstation.
     * Route: POST /api/crew/read-guide
     */
    public function readGuide(Request $request)
    {
        $request->validate([
            'role' => 'required|string', // e.g., 'cashier', 'fresh'
        ]);

        $user = Auth::user();

        // Find the workstation ID (Case Insensitive)
        $workStation = \App\Models\WorkStation::whereRaw('LOWER(name) = ?', [strtolower($request->role)])->first();

        if (!$workStation) {
            return response()->json(['message' => 'Invalid role'], 400);
        }

        $now = now();

        // Insert or ignore into guide_reads
        $guideRead = GuideRead::firstOrCreate(
            [
                'user_id' => $user->id,
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

    /**
     * Check if the guide for a specific role has already been read today.
     * Route: GET /api/crew/check-guide?role=cashier
     */
    public function checkGuideStatus(Request $request)
    {
        $request->validate([
            'role' => 'required|string',
        ]);

        $user = Auth::user();
        $workStation = \App\Models\WorkStation::whereRaw('LOWER(name) = ?', [strtolower($request->role)])->first();

        if (!$workStation) {
            return response()->json(['message' => 'Invalid role'], 400);
        }

        // Check if a guide read entry exists for today
        $hasRead = GuideRead::where('user_id', $user->id)
            ->where('work_station_id', $workStation->id)
            ->where('read_date', now()->toDateString())
            ->exists();

        return response()->json(['has_read' => $hasRead]);
    }
}
