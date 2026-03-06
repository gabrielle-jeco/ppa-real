<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Task;
use App\Models\ActivityLog;
use Illuminate\Support\Facades\Auth;
use App\Services\ScoringService;
use Carbon\Carbon;

class SupervisorController extends Controller
{
    /**
     * Get list of Crews under this Supervisor.
     * Logic: Crews in the same location (since Supervisor location is locked).
     */
    public function index(Request $request)
    {
        $user = Auth::user();

        // Security Check
        if ($user->role_type !== 'supervisor') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Fetch Crews via Reporting Lines relation
        $subordinates = $user->subordinateLines()->with('subordinate.locations')->get();
        $startOfMonth = Carbon::now()->startOfMonth();
        $endOfMonth = Carbon::now()->endOfMonth();

        $crews = $subordinates->pluck('subordinate')->filter(function ($crew) {
            return $crew && $crew->active;
        })
            ->values()
            ->map(function ($crew) use ($user, $startOfMonth, $endOfMonth) {
                $score = (($crew->user_id * 7 + 13) % 39) + 60; // Deterministic dummy (60-98) — waiting for YoAbsen
    
                // Real task completion for this crew (approved / total tasks this month)
                $totalTasks = Task::where('employee_id', $crew->user_id)
                    ->where('employer_id', $user->id)
                    ->whereBetween('due_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                    ->count();
                $approvedTasks = Task::where('employee_id', $crew->user_id)
                    ->where('employer_id', $user->id)
                    ->whereBetween('due_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                    ->whereIn('status', ['approved', 'completed'])
                    ->count();
                $taskProgress = $totalTasks > 0 ? round(($approvedTasks / $totalTasks) * 100, 1) : 0;
                $hasTasks = $totalTasks > 0;

                // Current workstation from today's latest ActivityLog
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
                    'score' => $score, // Dummy — attendance, waiting for YoAbsen
                    'activity_percentage' => $score, // Dummy — attendance, waiting for YoAbsen
                    'task_progress' => $taskProgress,
                    'has_tasks' => $hasTasks,
                    'is_top_performer' => $score > 90 // Dummy — attendance, waiting for YoAbsen
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
            'crews' => $crews
        ]);
    }

    /**
     * Get Supervisor's OWN Performance Stats.
     * Mocking data based on 'Penilaian Supervisor' mockup.
     */
    public function myStats(Request $request, ScoringService $scoringService)
    {
        $user = Auth::user();

        // Calculate REAL Supervisor Detailed Score
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
            'personality_score' => $detailedStats['personality_score'],
            'yearly_score' => $yearlyScore,
        ]);
    }
}
