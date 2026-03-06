<?php

namespace App\Services;

use App\Models\User;
use App\Models\Task;
use App\Models\Attendance;
use App\Models\GuideRead;
use App\Models\MonthlyPersonalityEvaluation;
use App\Models\ReportingLine;
use Carbon\Carbon;

class ScoringService
{
    /**
     * Calculate Daily Score for a Crew
     */
    public function getCrewDailyScore(User $crew, Carbon $date): int
    {
        // 1. Guide (100 if read today, 0 otherwise)
        $guideRead = GuideRead::where('user_id', $crew->id)
            ->whereDate('read_date', $date->toDateString())
            ->exists();
        $guideScore = $guideRead ? 100 : 0;

        // 2. Attendance (100 if Present 'H' today, else 0)
        $attendance = Attendance::where('user_id', $crew->id)
            ->whereDate('date', $date->toDateString())
            ->first();
        // H = Hadir
        $attendanceScore = ($attendance && $attendance->status_code === 'H') ? 100 : 0;

        // 3. Task Completion
        $tasks = Task::where('employee_id', $crew->id)
            ->whereDate('due_at', $date->toDateString())
            ->get();

        $totalGiven = $tasks->count();
        $totalCompleted = $tasks->whereIn('status', ['approved', 'completed'])->count();

        if ($totalGiven == 0) {
            $taskScore = 0;
        } else {
            if ($totalCompleted <= $totalGiven) {
                $taskScore = ($totalCompleted / $totalGiven) * 100;
            } else {
                // If Selesai > Target (Spamming)
                $taskScore = 100 - ((($totalCompleted - $totalGiven) / $totalGiven) * 100);
            }
        }

        // 4. Personality (Monthly)
        $personality = MonthlyPersonalityEvaluation::where('evaluatee_id', $crew->id)
            ->whereYear('evaluation_period', $date->year)
            ->whereMonth('evaluation_period', $date->month)
            ->first();
        $personalityScore = $personality ? $personality->score : 0;

        return (int) round(($guideScore + $attendanceScore + $taskScore + $personalityScore) / 4);
    }

    /**
     * Calculate Monthly Score for a Crew
     */
    public function getCrewMonthlyScore(User $crew, Carbon $month): array
    {
        $startOfMonth = $month->copy()->startOfMonth();
        $endOfMonth = $month->copy()->endOfMonth();
        $today = Carbon::now();
        $calcEndDate = $endOfMonth->lt($today) ? $endOfMonth : $today;

        $guideElapsedWorkingDays = 0;
        $attendanceElapsedWorkingDays = 0;
        $guideScoreAccumulator = 0;

        // Fetch user attendances for the entire month
        $attendances = \App\Models\Attendance::where('user_id', $crew->id)
            ->whereBetween('date', [$startOfMonth->toDateString(), $calcEndDate->toDateString()])
            ->get()
            ->keyBy(function ($item) {
                return Carbon::parse($item->date)->toDateString();
            });

        // Bulk-fetch ActivityLogs and GuideReads for the entire month (avoids N+1 per-day queries)
        $allActivityLogs = \App\Models\ActivityLog::where('user_id', $crew->id)
            ->whereBetween('created_at', [$startOfMonth, $calcEndDate->copy()->endOfDay()])
            ->whereNotNull('work_station_id')
            ->get();

        $allGuideReads = \App\Models\GuideRead::where('user_id', $crew->id)
            ->whereBetween('read_date', [$startOfMonth->toDateString(), $calcEndDate->toDateString()])
            ->get();

        // 1. Guide Average & Attendance Denominator (Daily Check)
        for ($date = $startOfMonth->copy(); $date->lte($calcEndDate); $date->addDay()) {
            if ($date->isWeekend()) {
                continue; // Skip weekends
            }
            $dateString = $date->toDateString();
            $att = $attendances->get($dateString);

            // If day is officially marked as Sick (S), Leave (C), Holiday (L), it doesn't count against ANY score
            if ($att && in_array($att->status_code, ['S', 'C', 'L'])) {
                continue;
            }

            // Standard working day (or Absent 'A'), counts against Attendance Score
            $attendanceElapsedWorkingDays++;

            // Find Unique WorkStations from pre-fetched ActivityLogs for this day
            $assignedStations = $allActivityLogs
                ->filter(fn($log) => $log->created_at->toDateString() === $dateString)
                ->pluck('work_station_id')
                ->unique()
                ->toArray();

            // Opsi B: Only obligate guide reading if Present/Late ('H', 'T') OR if they somehow worked (activity log > 0)
            $isWorking = ($att && in_array($att->status_code, ['H', 'T'])) || (count($assignedStations) > 0);

            if ($isWorking) {
                $guideElapsedWorkingDays++;

                if (count($assignedStations) > 0) {
                    // Filter from pre-fetched GuideReads for this day
                    // Note: read_date is cast to Carbon by Eloquent, so we must use ->toDateString()
                    $readStations = $allGuideReads
                        ->filter(fn($gr) => $gr->read_date->toDateString() === $dateString)
                        ->pluck('work_station_id')
                        ->toArray();

                    // Calculate matching
                    $matched = 0;
                    foreach ($assignedStations as $stationId) {
                        if (in_array($stationId, $readStations)) {
                            $matched++;
                        }
                    }
                    $dailyGuideScore = ($matched / count($assignedStations)) * 100;
                    $guideScoreAccumulator += $dailyGuideScore;
                }
            }
        }

        if ($guideElapsedWorkingDays == 0)
            $guideElapsedWorkingDays = 1;
        if ($attendanceElapsedWorkingDays == 0)
            $attendanceElapsedWorkingDays = 1;

        $guideScore = min(100, $guideScoreAccumulator / $guideElapsedWorkingDays);

        // 2. Attendance Average
        $attendancesCount = $attendances->filter(function ($att) {
            return in_array($att->status_code, ['H', 'T']);
        })->count();

        $attendanceScore = min(100, ($attendancesCount / $attendanceElapsedWorkingDays) * 100);

        // 3. Task Average (Monthly Accumulation to avoid volatile daily jumps)
        $tasks = Task::where('employee_id', $crew->id)
            ->whereBetween('due_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
            ->get();
        $totalGiven = $tasks->count();
        $totalCompleted = $tasks->whereIn('status', ['approved', 'completed'])->count();

        if ($totalGiven == 0) {
            $taskScore = 0;
        } else if ($totalCompleted <= $totalGiven) {
            $taskScore = ($totalCompleted / $totalGiven) * 100;
        } else {
            $taskScore = 100 - ((($totalCompleted - $totalGiven) / $totalGiven) * 100);
        }

        // 4. Personality Score
        $personality = \App\Models\MonthlyPersonalityEvaluation::where('evaluatee_id', $crew->id)
            ->whereYear('evaluation_period', $month->year)
            ->whereMonth('evaluation_period', $month->month)
            ->first();
        $personalityScore = $personality ? $personality->score : 0;

        $totalScore = (int) round(($guideScore + $attendanceScore + $taskScore + $personalityScore) / 4);

        return [
            'guide_score' => $guideScore,
            'attendance_score' => $attendanceScore,
            'task_score' => $taskScore,
            'personality_score' => $personalityScore,
            'total_score' => $totalScore
        ];
    }

    /**
     * Get Detailed Monthly Stats for a Crew (Active %, Point Sikap, Activity Monitor)
     */
    public function getCrewMonthlyDetailedStats(User $crew, Carbon $month): array
    {
        $startOfMonth = $month->copy()->startOfMonth();
        $endOfMonth = $month->copy()->endOfMonth();

        // 1. Active Percentage (Attendance)
        $totalDays = $startOfMonth->diffInDaysFiltered(function (Carbon $date) {
            return !$date->isWeekend();
        }, $endOfMonth);
        if ($totalDays == 0)
            $totalDays = 1;

        $attendancesCount = Attendance::where('user_id', $crew->id)
            ->whereBetween('date', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
            ->where('status_code', 'H')
            ->count();
        $activePercentage = min(100, ($attendancesCount / $totalDays) * 100);

        // 2. Personality Point
        $personality = MonthlyPersonalityEvaluation::where('evaluatee_id', $crew->id)
            ->whereYear('evaluation_period', $month->year)
            ->whereMonth('evaluation_period', $month->month)
            ->first();
        $personalityScore = $personality ? $personality->score : 0;

        // 3. Activity Monitor (Role Ratios)
        $logs = \App\Models\ActivityLog::with('workStation')
            ->where('user_id', $crew->id)
            ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
            ->get();

        $roleCounts = [];
        $totalRoles = 0;
        foreach ($logs as $log) {
            if ($log->workStation) {
                $roleName = $log->workStation->name;
                if (!isset($roleCounts[$roleName])) {
                    $roleCounts[$roleName] = 0;
                }
                $roleCounts[$roleName]++;
                $totalRoles++;
            }
        }

        $activityMonitor = [];
        if ($totalRoles > 0) {
            foreach ($roleCounts as $role => $count) {
                $activityMonitor[] = [
                    'label' => $role,
                    'percentage' => (int) round(($count / $totalRoles) * 100)
                ];
            }
        }

        return [
            'active_percentage' => (int) round($activePercentage),
            'personality_score' => $personalityScore,
            'activity_monitor' => $activityMonitor
        ];
    }

    /**
     * Calculate Yearly Score for a Crew
     */
    public function getCrewYearlyScore(User $crew, Carbon $yearDate): int
    {
        $currentMonth = Carbon::now()->month;
        $currentYear = Carbon::now()->year;
        $targetYear = $yearDate->year;

        if ($targetYear > $currentYear) {
            return 0; // Future year
        }

        $monthsToCalculate = ($targetYear === $currentYear) ? $currentMonth : 12;

        // 1. Fetch locked snapshots from the Database
        $snapshots = \App\Models\MonthlyOverallScore::where('user_id', $crew->id)
            ->whereYear('period', $targetYear)
            ->get()
            ->keyBy(function ($item) {
                return $item->period->format('Y-m-d');
            });

        $totalScore = 0;

        for ($month = 1; $month <= $monthsToCalculate; $month++) {
            $monthDate = Carbon::create($targetYear, $month, 1);
            $periodKey = $monthDate->toDateString(); // 'YYYY-MM-01'

            if ($monthDate->format('Y-m') === Carbon::now()->format('Y-m')) {
                // Current live month
                $monthlyScoreData = $this->getCrewMonthlyScore($crew, $monthDate);
                $totalScore += $monthlyScoreData['total_score'];
            } else if ($snapshots->has($periodKey)) {
                $totalScore += $snapshots->get($periodKey)->final_score;
            } else {
                $monthlyScoreData = $this->getCrewMonthlyScore($crew, $monthDate);
                $totalScore += $monthlyScoreData['total_score'];
            }
        }

        return $monthsToCalculate > 0 ? (int) round($totalScore / $monthsToCalculate) : 0;
    }

    /**
     * Calculate Monthly Score for a Supervisor
     * Delegates to getDetailedScore to avoid duplicated query logic.
     */
    public function getSupervisorMonthlyScore(User $supervisor, Carbon $month): int
    {
        $details = $this->getSupervisorMonthlyDetailedScore($supervisor, $month);
        return $details['my_avg_point'];
    }
    /**
     * Calculate Detailed Monthly Score for a Supervisor
     */
    public function getSupervisorMonthlyDetailedScore(User $supervisor, Carbon $month): array
    {
        $startOfMonth = $month->copy()->startOfMonth();
        $endOfMonth = $month->copy()->endOfMonth();

        // 1. Penugasan SC
        $subordinateLines = $supervisor->subordinateLines()->where('status', 'active')->get();
        $scScores = [];
        $totalTaskGiven = 0;

        // Daily calculation vars
        $targetDate = $month->copy(); // $month parameter acts as the target date
        $startOfDay = $targetDate->copy()->startOfDay();
        $endOfDay = $targetDate->copy()->endOfDay();
        $dailyTaskGiven = 0;
        $dailyCrewTotalPoints = 0;

        $scCount = $subordinateLines->count();
        $crewTotalPoints = 0;

        foreach ($subordinateLines as $line) {
            $monthlyTasks = Task::where('employer_id', $supervisor->id)
                ->where('employee_id', $line->subordinate_id)
                ->whereBetween('due_at', [$startOfMonth->toDateString(), $endOfMonth->endOfDay()])
                ->get();

            $tasksGivenCount = $monthlyTasks->count();
            $totalTaskGiven += $tasksGivenCount;

            // Count tasks specific to the target day
            $dailyTaskGiven += $monthlyTasks->filter(function ($t) use ($startOfDay, $endOfDay) {
                return Carbon::parse($t->due_at)->between($startOfDay, $endOfDay);
            })->count();

            if ($tasksGivenCount >= 3) {
                $scScores[] = 100;
            } elseif ($tasksGivenCount > 0) {
                $scScores[] = 50;
            } else {
                $scScores[] = 0;
            }

            $crewUser = User::find($line->subordinate_id);
            if ($crewUser) {
                $monthlyScoreData = $this->getCrewMonthlyScore($crewUser, $month); // $month is actually target date
                $crewTotalPoints += $monthlyScoreData['total_score'];
                $dailyCrewTotalPoints += $monthlyScoreData['total_score']; // In Option A, Running Score = Daily Score
            }
        }

        $scAverageScore = count($scScores) > 0 ? array_sum($scScores) / count($scScores) : 0;
        $avgServiceCrewPoint = $scCount > 0 ? $crewTotalPoints / $scCount : 0;
        $dailyAvgServiceCrewPoint = $scCount > 0 ? $dailyCrewTotalPoints / $scCount : 0;

        // 2. Penugasan Project SPV dari Manager
        $managerLine = $supervisor->leaderLines()->where('status', 'active')->first();
        $managerId = $managerLine ? $managerLine->leader_id : null;

        if ($managerId) {
            $projects = Task::where('employee_id', $supervisor->id)
                ->where('employer_id', $managerId)
                ->whereBetween('due_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                ->get();

            $totalProjects = $projects->count();
            $completedProjects = $projects->whereIn('status', ['approved', 'completed'])->count();

            if ($totalProjects == 0) {
                $projectScore = 0;
            } else {
                $projectScore = ($completedProjects / $totalProjects) * 100;
            }
        } else {
            $projectScore = 0;
        }

        $myAvgPoint = (int) round(($scAverageScore * 0.6) + ($projectScore * 0.4));

        return [
            'my_avg_point' => $myAvgPoint,
            'task_for_sc' => [
                'completed' => (int) round($scAverageScore),
                'total' => 100,
                'label' => 'Task for SC'
            ],
            'task_from_manager' => [
                'completed' => (int) round($projectScore),
                'total' => 100,
                'label' => 'Task Completed From SM/RM'
            ],
            'monthly_task_given' => "{$totalTaskGiven} / {$scCount} People",
            'avg_service_crew_point' => (int) round($avgServiceCrewPoint),
            // New Daily Stats
            'daily_task_given' => "{$dailyTaskGiven} / {$scCount} People",
            'avg_sc_point_today' => (int) round($dailyAvgServiceCrewPoint)
        ];
    }
}