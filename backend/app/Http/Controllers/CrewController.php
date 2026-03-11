<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Task;
use App\Services\ScoringService;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class CrewController extends Controller
{
    protected $scoringService;

    public function __construct(ScoringService $scoringService)
    {
        $this->scoringService = $scoringService;
    }

    /**
     * Get Crew's OWN Performance Stats.
     * Route: GET /api/crew/stats
     */
    public function myStats(Request $request)
    {
        $authUser = Auth::user();
        $targetUserId = $request->query('user_id', $authUser->id);

        $user = User::find($targetUserId);
        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        // Authorization logic
        if ($authUser->id != $user->id) {
            // Must be superior to view other's stats
            if ($authUser->role_type !== 'supervisor' && $authUser->role_type !== 'manager') {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            // Hierarchy Check: The superior must be the direct manager/supervisor of the user
            $isSubordinate = $authUser->subordinateLines()->where('subordinate_id', $user->id)->where('status', 'active')->exists();
            if (!$isSubordinate) {
                return response()->json(['message' => 'Unauthorized. This user is not your subordinate.'], 403);
            }
        } else {
            // Allow both standard 'crew' and 'employee' alias for own stats
            if ($user->role_type !== 'employee' && $user->role_type !== 'crew') {
                return response()->json(['message' => 'Unauthorized'], 403);
            }
        }

        $month = $request->query('month', Carbon::now()->month);
        $year = $request->query('year', Carbon::now()->year);

        try {
            $targetDate = Carbon::create($year, $month, 1);
        } catch (\Exception $e) {
            $targetDate = Carbon::now();
        }

        // Use ScoringService to calculate live data
        $dailyScore = $this->scoringService->getCrewDailyScore($user, Carbon::now());
        $monthlyScoreData = $this->scoringService->getCrewMonthlyScore($user, $targetDate);
        $monthlyScore = $monthlyScoreData['total_score'];
        $yearlyScore = $this->scoringService->getCrewYearlyScore($user, $targetDate);
        $detailedStats = $this->scoringService->getCrewMonthlyDetailedStats($user, $targetDate);

        // Daily Task Progress
        $tasks = Task::where('employee_id', $user->id)
            ->whereDate('due_at', Carbon::now()->toDateString())
            ->get();

        $totalGiven = $tasks->count();
        $totalCompleted = $tasks->whereIn('status', ['approved', 'completed'])->count();

        return response()->json([
            'daily_score' => $dailyScore,
            'monthly_score' => $monthlyScore,
            'yearly_score' => $yearlyScore,
            'active_percentage' => $detailedStats['active_percentage'],
            'personality_score' => $detailedStats['personality_score'],
            'activity_monitor' => $detailedStats['activity_monitor'],
            'task_progress' => [
                'completed' => $totalCompleted,
                'total' => $totalGiven
            ]
        ]);
    }
}
