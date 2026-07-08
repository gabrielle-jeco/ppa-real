<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Task;
use App\Services\ScoringService;
use App\Services\YojadwalPresenceService;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class CrewController extends Controller
{
    protected $scoringService;
    protected $presenceService;

    public function __construct(ScoringService $scoringService, YojadwalPresenceService $presenceService)
    {
        $this->scoringService = $scoringService;
        $this->presenceService = $presenceService;
    }

    public function myStats(Request $request)
    {
        $authUser = Auth::user();
        $targetUserId = $request->query('user_id', $authUser->username);

        $user = User::where('username', $targetUserId)->first();
        if (!$user) {
            return response()->json(['message' => 'User tidak ditemukan.'], 404);
        }

        if ($authUser->username !== $user->username) {
            if ($authUser->role_type !== 'supervisor' && $authUser->role_type !== 'manager') {
                return response()->json(['message' => 'Tidak memiliki akses.'], 403);
            }

            $isSubordinate = $authUser->subordinateLines()->where('subordinate_id', $user->username)->where('status', 'active')->exists();
            if (!$isSubordinate) {
                return response()->json(['message' => 'Tidak memiliki akses. User ini bukan bawahan Anda.'], 403);
            }
        } else {
            if ($user->role_type !== 'employee' && $user->role_type !== 'crew') {
                return response()->json(['message' => 'Tidak memiliki akses.'], 403);
            }
        }

        $month = $request->query('month', Carbon::now()->month);
        $year = $request->query('year', Carbon::now()->year);

        try {
            $targetDate = Carbon::create($year, $month, 1);
        } catch (\Exception $e) {
            $targetDate = Carbon::now();
        }

        $this->presenceService->syncMonthIfNeeded($user->username, (int) $targetDate->month, (int) $targetDate->year);

        $dailyScore = $this->scoringService->getCrewDailyScore($user, Carbon::now());
        $monthlyScoreData = $this->scoringService->getCrewMonthlyScore($user, $targetDate);
        $monthlyScore = $monthlyScoreData['total_score'];
        $yearlyScore = $this->scoringService->getCrewYearlyScore($user, $targetDate);
        $detailedStats = $this->scoringService->getCrewMonthlyDetailedStats($user, $targetDate);

        $tasks = Task::where('employee_id', $user->username)
            ->activeOnDate(Carbon::today())
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
            'attendance_calendar' => $detailedStats['attendance_calendar'],
            'task_progress' => [
                'completed' => $totalCompleted,
                'total' => $totalGiven
            ]
        ]);
    }
}
