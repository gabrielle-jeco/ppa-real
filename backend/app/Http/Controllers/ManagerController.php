<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Services\ScoringService;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class ManagerController extends Controller
{
    /**
     * Get list of supervisors for the logged-in manager.
     */
    public function getSupervisors(Request $request, ScoringService $scoringService)
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
            return ['id' => $loc->initial, 'name' => $loc->name];
        });

        $filterLocationName = 'All Locations';

        // LOGIC: Filter by Location
        if ($user->manager_type === 'SM') {
            $smLocationId = $user->locations->first() ? $user->locations->first()->initial : null;
            $filterLocationName = $user->locations->first() ? $user->locations->first()->name : 'Unknown Location';

            if ($smLocationId) {
                $supervisorsCollection = $supervisorsCollection->filter(function ($spv) use ($smLocationId) {
                    return $spv->locations->contains('initial', $smLocationId);
                });
            }
        } else {
            // Regional Manager: Can filter by specific location dropdown
            if ($request->has('location_id') && $request->location_id) {
                $supervisorsCollection = $supervisorsCollection->filter(function ($spv) use ($request) {
                    return $spv->locations->contains('initial', $request->location_id);
                });

                $loc = $user->locations->firstWhere('initial', $request->location_id);
                $filterLocationName = $loc ? $loc->name : 'Unknown Location';
            }
        }

        $supervisors = $supervisorsCollection->values()->map(function ($spv) use ($scoringService) {
            $stats = $scoringService->getSupervisorMonthlyDetailedScore($spv, Carbon::now());
            $score = $stats['my_avg_point'] ?? 0;

            return [
                'id' => $spv->username,
                'name' => $spv->name,
                'role' => 'Supervisor',
                'location' => $spv->locations->first() ? $spv->locations->first()->name : 'N/A',
                'status' => $spv->active ? 'active' : 'inactive',
                'score' => $score,
                'activity_percentage' => $score,
                'task_progress' => $score,
                'has_tasks' => true,
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
            'location_avg_progress' => round($supervisors->avg('task_progress') ?? 0, 1),
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

        $supervisor = User::where('username', $id)->first();
        if (!$supervisor) {
            return response()->json(['message' => 'Supervisor not found'], 404);
        }

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

    public function getSupervisorCrewTasks($id, Request $request, ScoringService $scoringService)
    {
        $manager = Auth::user();

        if ($manager->role_type !== 'manager') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $isSubordinate = $manager->subordinateLines()
            ->where('subordinate_id', $id)
            ->where('status', 'active')
            ->exists();

        if (!$isSubordinate) {
            return response()->json(['message' => 'Unauthorized or Supervisor not found'], 403);
        }

        $supervisor = User::where('username', $id)->first();
        if (!$supervisor) {
            return response()->json(['message' => 'Supervisor not found'], 404);
        }

        $targetDate = $request->has('date')
            ? Carbon::parse($request->date)
            : Carbon::today();

        $crews = $supervisor->subordinateLines()
            ->where('status', 'active')
            ->with(['subordinate.locations'])
            ->get()
            ->pluck('subordinate')
            ->filter(function ($crew) {
                return $crew && $crew->active;
            })
            ->values()
            ->map(function ($crew) use ($supervisor, $targetDate, $scoringService) {
                $tasks = \App\Models\Task::with(['evidences', 'workStation'])
                    ->where('employee_id', $crew->username)
                    ->where('employer_id', $supervisor->username)
                    ->whereDate('due_at', $targetDate->toDateString())
                    ->orderBy('due_at', 'asc')
                    ->get();

                $approvedCount = $tasks->whereIn('status', ['approved', 'completed'])->count();
                $overdueCount = $tasks->filter(function ($task) {
                    return !in_array($task->status, ['approved', 'completed'], true)
                        && Carbon::parse($task->due_at)->isPast();
                })->count();

                $crewStats = $scoringService->getCrewMonthlyDetailedStats($crew, $targetDate);

                return [
                    'id' => $crew->username,
                    'name' => $crew->name,
                    'role' => $crew->role_type,
                    'location' => $crew->locations->first() ? $crew->locations->first()->name : 'N/A',
                    'activity_percentage' => $crewStats['active_percentage'] ?? 0,
                    'tasks_total' => $tasks->count(),
                    'tasks_approved' => $approvedCount,
                    'tasks_pending' => $tasks->count() - $approvedCount,
                    'tasks_overdue' => $overdueCount,
                    'tasks' => $tasks,
                ];
            });

        return response()->json([
            'supervisor' => [
                'id' => $supervisor->username,
                'name' => $supervisor->name,
                'location' => $supervisor->locations->first() ? $supervisor->locations->first()->name : 'N/A',
            ],
            'date' => $targetDate->toDateString(),
            'crews' => $crews,
        ]);
    }
}
