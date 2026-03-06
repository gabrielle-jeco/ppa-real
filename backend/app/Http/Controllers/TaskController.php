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

        // Security check (if Manager, allow if in same location or RM. If Supervisor, allow only self)
        // For simplicity now, assuming Manager context

        $query = Task::where('employee_id', $supervisorId);

        if ($request->has('date')) {
            $query->whereDate('due_at', $request->date);
        }

        $tasks = $query->orderBy('due_at', 'asc')->get();

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
        $task = Task::findOrFail($id);

        // Only the creator (employer) can delete a task
        if ($task->employer_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
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
            'before' => 'nullable|image|max:10240', // Max 10MB
            'after' => 'nullable|image|max:10240',
        ]);

        $task = Task::findOrFail($id);

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

        if ($request->hasFile('before')) {
            $path = $request->file('before')->store('tasks', 'public');
            $task->before_image = $path;
        }

        if ($request->hasFile('after')) {
            $path = $request->file('after')->store('tasks', 'public');
            $task->after_image = $path;
        }

        // Do not update status here; status remains pending until approved by supervisor.

        $task->save();

        return response()->json($task);
    }
    /**
     * Remove evidence image (before/after) from a task.
     * Route: DELETE /api/tasks/{id}/evidence
     */
    public function removeEvidence(Request $request, $id)
    {
        $request->validate([
            'type' => 'required|in:before,after'
        ]);

        $task = Task::findOrFail($id);
        $type = $request->input('type');

        if ($type === 'before') {
            $task->before_image = null;
        } elseif ($type === 'after') {
            $task->after_image = null;
        }

        $task->save();

        return response()->json(['message' => 'Evidence removed', 'task' => $task]);
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
