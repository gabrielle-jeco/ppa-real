<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Task;
use App\Models\User;
use App\Services\ScoringService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class SupervisorController extends Controller
{
    /**
     * Get list of Crews under this Supervisor.
     * Logic: Crews in the same location (since Supervisor location is locked).
     */
    public function index(Request $request, ScoringService $scoringService)
    {
        $user = Auth::user();

        if ($user->role_type !== 'supervisor') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $subordinates = $user->subordinateLines()->with('subordinate.locations')->get();
        $today = Carbon::today();

        $crews = $subordinates->pluck('subordinate')->filter(function ($crew) {
            return $crew && $crew->active;
        })
            ->values()
            ->map(function ($crew) use ($user, $today, $scoringService) {
                $crewStats = $scoringService->getCrewMonthlyDetailedStats($crew, Carbon::now());
                $score = $crewStats['active_percentage'] ?? 0;

                $totalTasks = Task::where('employee_id', $crew->user_id)
                    ->where('employer_id', $user->id)
                    ->whereDate('due_at', $today->toDateString())
                    ->count();

                $approvedTasks = Task::where('employee_id', $crew->user_id)
                    ->where('employer_id', $user->id)
                    ->whereDate('due_at', $today->toDateString())
                    ->whereIn('status', ['approved', 'completed'])
                    ->count();

                $taskProgress = $totalTasks > 0 ? round(($approvedTasks / $totalTasks) * 100, 1) : 0;
                $hasTasks = $totalTasks > 0;

                $latestLog = ActivityLog::with('workStation')
                    ->where('user_id', $crew->user_id)
                    ->whereDate('created_at', Carbon::today())
                    ->orderBy('created_at', 'desc')
                    ->first();

                $currentWorkstation = $latestLog && $latestLog->workStation
                    ? $latestLog->workStation->name
                    : null;

                return [
                    'id' => $crew->user_id,
                    'name' => $crew->full_name,
                    'role' => $crew->role_type,
                    'current_workstation' => $currentWorkstation,
                    'location' => $crew->locations->first() ? $crew->locations->first()->name : 'N/A',
                    'status' => 'active',
                    'score' => $score,
                    'activity_percentage' => $score,
                    'task_progress' => $taskProgress,
                    'has_tasks' => $hasTasks,
                    'is_top_performer' => $score > 90,
                ];
            });

        return response()->json([
            'supervisor' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => 'Supervisor',
                'location' => $user->locations->first() ? $user->locations->first()->name : 'Unknown',
            ],
            'location_name' => $user->locations->first() ? $user->locations->first()->name : 'All Locations',
            'location_avg_progress' => round($crews->where('has_tasks', true)->avg('task_progress') ?? 0, 1),
            'crews' => $crews,
        ]);
    }

    /**
     * Get Supervisor's OWN Performance Stats.
     * Mocking data based on 'Penilaian Supervisor' mockup.
     */
    public function myStats(Request $request, ScoringService $scoringService)
    {
        $user = Auth::user();
        $month = $request->query('month', Carbon::now()->month);
        $year = $request->query('year', Carbon::now()->year);

        try {
            $targetDate = Carbon::create($year, $month, 1);
        } catch (\Exception $e) {
            $targetDate = Carbon::now();
        }

        $detailedStats = $scoringService->getSupervisorMonthlyDetailedScore($user, $targetDate);

        return response()->json($detailedStats);
    }

    /**
     * Get Crew Evaluation Stats (Activity Monitor, Personality, Yearly Score).
     * Route: GET /api/supervisor/crew/{id}/eval-stats
     */
    public function getCrewEvalStats($id, Request $request, ScoringService $scoringService)
    {
        $user = Auth::user();
        if ($user->role_type !== 'supervisor' && $user->role_type !== 'manager') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $crewUser = User::find($id);
        if (!$crewUser) {
            return response()->json(['message' => 'Crew not found'], 404);
        }

        $isSubordinate = $user->subordinateLines()->where('subordinate_id', $id)->where('status', 'active')->exists();
        if (!$isSubordinate) {
            return response()->json(['message' => 'Unauthorized. You can only view stats for your direct subordinates.'], 403);
        }

        $month = $request->query('month', Carbon::now()->month);
        $year = $request->query('year', Carbon::now()->year);

        try {
            $targetDate = Carbon::create($year, $month, 1);
        } catch (\Exception $e) {
            $targetDate = Carbon::now();
        }

        $detailedStats = $scoringService->getCrewMonthlyDetailedStats($crewUser, $targetDate);
        $yearlyScore = $scoringService->getCrewYearlyScore($crewUser, $targetDate);

        return response()->json([
            'activity_monitor' => $detailedStats['activity_monitor'],
            'active_percentage' => $detailedStats['active_percentage'],
            'personality_score' => $detailedStats['personality_score'],
            'yearly_score' => $yearlyScore,
        ]);
    }
}
