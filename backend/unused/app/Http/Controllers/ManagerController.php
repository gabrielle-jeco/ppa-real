<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class ManagerController extends Controller
{
    /**
     * Get list of supervisors for the logged-in manager.
     */
    public function getSupervisors(Request $request)
    {
        $user = Auth::user();

        // Security Check: Must be a manager
        if ($user->role_type !== 'manager') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Fetch Supervisors through Reporting Lines
        $supervisorsCollection = $user->subordinateLines()->with(['subordinate.locations'])->get()
            ->pluck('subordinate')
            ->filter(function ($spv) {
                return $spv && $spv->active;
            });

        $locations = $user->locations->map(function ($loc) {
            return ['id' => $loc->id, 'name' => $loc->name];
        });

        $filterLocationName = 'All Locations';

        // LOGIC: Filter by Location
        if ($user->manager_type === 'SM') {
            $smLocationId = $user->locations->first() ? $user->locations->first()->id : null;
            $filterLocationName = $user->locations->first() ? $user->locations->first()->name : 'Unknown Location';

            if ($smLocationId) {
                $supervisorsCollection = $supervisorsCollection->filter(function ($spv) use ($smLocationId) {
                    return $spv->locations->contains('id', $smLocationId);
                });
            }
        } else {
            // Regional Manager: Can filter by specific location dropdown
            if ($request->has('location_id') && $request->location_id) {
                $supervisorsCollection = $supervisorsCollection->filter(function ($spv) use ($request) {
                    return $spv->locations->contains('id', $request->location_id);
                });

                $loc = $user->locations->firstWhere('id', $request->location_id);
                $filterLocationName = $loc ? $loc->name : 'Unknown Location';
            }
        }

        $startOfMonth = Carbon::now()->startOfMonth()->toDateString();
        $endOfMonth = Carbon::now()->endOfMonth()->toDateString();

        $supervisors = $supervisorsCollection->values()->map(function ($spv) use ($startOfMonth, $endOfMonth) {
            // Deterministic score based on user ID for visual stability (simulate YoAbsen)
            $score = (($spv->id * 7 + 13) % 39) + 60; // Returns 60-98 consistently

            // Calculate Task Progress: Supervisor's own tasks (assigned by the manager)
            $tasks = \App\Models\Task::where('employee_id', $spv->id)
                ->whereBetween('due_at', [$startOfMonth, $endOfMonth])
                ->get();

            $totalTasks = $tasks->count();
            $completedTasks = $tasks->whereIn('status', ['approved', 'completed'])->count();

            $taskProgress = $totalTasks > 0 ? (int) round(($completedTasks / $totalTasks) * 100) : 0;
            $hasTasks = $totalTasks > 0;

            return [
                'id' => $spv->id,
                'name' => $spv->name,
                'role' => 'Supervisor',
                'location' => $spv->locations->first() ? $spv->locations->first()->name : 'N/A',
                'status' => $spv->active ? 'active' : 'inactive',
                'score' => $score,
                'activity_percentage' => $score, // Mapping score to activity % for now
                'task_progress' => $taskProgress,
                'has_tasks' => $hasTasks,
                'is_top_performer' => $score > 90 // Logic for the Star icon
            ];
        });


        return response()->json([
            'manager' => [
                'name' => $user->name,
                'role' => $user->role_type === 'manager' ? ($user->manager_type === 'SM' ? 'Store Manager' : 'Regional Manager') : 'Manager',
                'type' => $user->manager_type // identifying RM vs SM on frontend
            ],
            'location_name' => $filterLocationName,
            'locations' => $locations, // List for dropdown
            'location_avg_progress' => round($supervisors->where('has_tasks', true)->avg('task_progress') ?? 0, 1),
            'supervisors' => $supervisors
        ]);
    }

    /**
     * Get Detailed Stats for a specific supervisor under the manager
     */
    public function getSupervisorStats($id, Request $request, \App\Services\ScoringService $scoringService)
    {
        $manager = Auth::user();

        // Security Check: Must be a manager
        if ($manager->role_type !== 'manager') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Authorization check: Is this supervisor directly under the manager?
        $isSubordinate = $manager->subordinateLines()->where('subordinate_id', $id)->where('status', 'active')->exists();
        if (!$isSubordinate) {
            return response()->json(['message' => 'Unauthorized or Supervisor not found'], 403);
        }

        $supervisor = User::find($id);

        $month = $request->query('month', Carbon::now()->month);
        $year = $request->query('year', Carbon::now()->year);
        $day = $request->query('day', null);

        try {
            if ($day) {
                // If specific date requested, use it as target
                $targetDate = Carbon::create($year, $month, $day);
            } else {
                $targetDate = Carbon::create($year, $month, 1);
            }
        } catch (\Exception $e) {
            $targetDate = Carbon::now();
        }

        $detailedStats = $scoringService->getSupervisorMonthlyDetailedScore($supervisor, $targetDate);

        return response()->json($detailedStats);
    }
}
