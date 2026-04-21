<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\GuideRead;
use App\Models\MonthlyOverallScore;
use App\Models\MonthlyPersonalityEvaluation;
use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;

class ScoringService
{
    public function getCrewDailyScore(User $crew, Carbon $date): int
    {
        if (!$this->isScoringDay($crew, $date)) {
            return 0;
        }

        $taskScore = $this->getCrewTaskScoreForDate($crew, $date);
        $attendanceScore = $this->getAttendanceScoreForDate($crew, $date);

        return (int) round(($taskScore * 0.6) + ($attendanceScore * 0.4));
    }

    public function getCrewMonthlyScore(User $crew, Carbon $month): array
    {
        [$startOfMonth, $endOfRange] = $this->getScoringRangeForMonth($month);

        if ($endOfRange->lt($startOfMonth)) {
            return [
                'daily_average_score' => 0,
                'task_score' => 0,
                'attendance_score' => 0,
                'personality_score' => 0,
                'total_score' => 0,
            ];
        }

        $dailyBreakdown = $this->collectDailyBreakdown($crew, $startOfMonth, $endOfRange);
        $dailyAverage = $this->average($dailyBreakdown['daily_scores']);
        $taskAverage = $this->average($dailyBreakdown['task_scores']);
        $attendanceAverage = $this->average($dailyBreakdown['attendance_scores']);
        $personalityScore = $this->getPersonalityScoreForMonth($crew, $month);
        $totalScore = (int) round(($dailyAverage * 0.7) + ($personalityScore * 0.3));

        return [
            'daily_average_score' => round($dailyAverage, 2),
            'task_score' => round($taskAverage, 2),
            'attendance_score' => round($attendanceAverage, 2),
            'personality_score' => $personalityScore,
            'total_score' => $totalScore,
        ];
    }

    public function getCrewMonthlyDetailedStats(User $crew, Carbon $month): array
    {
        [$startOfMonth, $endOfRange] = $this->getScoringRangeForMonth($month);
        $dailyBreakdown = $endOfRange->lt($startOfMonth)
            ? ['daily_scores' => []]
            : $this->collectDailyBreakdown($crew, $startOfMonth, $endOfRange);

        $guideReads = $endOfRange->lt($startOfMonth)
            ? collect()
            : GuideRead::with('workStation')
                ->where('user_id', $crew->id)
                ->whereBetween('read_date', [$startOfMonth->toDateString(), $endOfRange->toDateString()])
                ->get();

        $roleCounts = [];
        $totalReads = 0;

        foreach ($guideReads as $guideRead) {
            if (!$guideRead->workStation) {
                continue;
            }

            $roleName = $guideRead->workStation->name;
            $roleCounts[$roleName] = ($roleCounts[$roleName] ?? 0) + 1;
            $totalReads++;
        }

        $activityMonitor = [];
        if ($totalReads > 0) {
            foreach ($roleCounts as $role => $count) {
                $activityMonitor[] = [
                    'label' => $role,
                    'percentage' => (int) round(($count / $totalReads) * 100),
                ];
            }
        }

        return [
            'active_percentage' => (int) round($this->average($dailyBreakdown['daily_scores'] ?? [])),
            'personality_score' => $this->getPersonalityScoreForMonth($crew, $month),
            'activity_monitor' => $activityMonitor,
        ];
    }

    public function getCrewYearlyScore(User $crew, Carbon $yearDate): int
    {
        $currentMonth = Carbon::now()->month;
        $currentYear = Carbon::now()->year;
        $targetYear = $yearDate->year;

        if ($targetYear > $currentYear) {
            return 0;
        }

        $monthsToCalculate = ($targetYear === $currentYear) ? $currentMonth : 12;

        $snapshots = MonthlyOverallScore::where('user_id', $crew->id)
            ->whereYear('period', $targetYear)
            ->get()
            ->keyBy(function ($item) {
                return $item->period->format('Y-m-d');
            });

        $totalScore = 0;

        for ($month = 1; $month <= $monthsToCalculate; $month++) {
            $monthDate = Carbon::create($targetYear, $month, 1);
            $periodKey = $monthDate->toDateString();

            if ($monthDate->format('Y-m') === Carbon::now()->format('Y-m')) {
                $monthlyScoreData = $this->getCrewMonthlyScore($crew, $monthDate);
                $totalScore += $monthlyScoreData['total_score'];
            } elseif ($snapshots->has($periodKey)) {
                $totalScore += $snapshots->get($periodKey)->final_score;
            } else {
                $monthlyScoreData = $this->getCrewMonthlyScore($crew, $monthDate);
                $totalScore += $monthlyScoreData['total_score'];
            }
        }

        return $monthsToCalculate > 0 ? (int) round($totalScore / $monthsToCalculate) : 0;
    }

    public function getSupervisorMonthlyScore(User $supervisor, Carbon $month): int
    {
        $details = $this->getSupervisorMonthlyDetailedScore($supervisor, $month);
        return $details['my_avg_point'];
    }

    public function getSupervisorMonthlyDetailedScore(User $supervisor, Carbon $month): array
    {
        $startOfMonth = $month->copy()->startOfMonth();
        $endOfMonth = $month->copy()->endOfMonth();

        $subordinateLines = $supervisor->subordinateLines()->where('status', 'active')->get();
        $scScores = [];
        $totalTaskGiven = 0;

        $targetDate = $month->copy();
        $startOfDay = $targetDate->copy()->startOfDay();
        $endOfDay = $targetDate->copy()->endOfDay();
        $dailyTaskGiven = 0;
        $dailyCrewTotalPoints = 0;

        $scCount = $subordinateLines->count();
        $crewTotalPoints = 0;

        foreach ($subordinateLines as $line) {
            $monthlyTasks = Task::where('employer_id', $supervisor->id)
                ->where('employee_id', $line->subordinate_id)
                ->whereBetween('due_at', [$startOfMonth->toDateString(), $endOfMonth->copy()->endOfDay()])
                ->get();

            $tasksGivenCount = $monthlyTasks->count();
            $totalTaskGiven += $tasksGivenCount;

            $dailyTaskGiven += $monthlyTasks->filter(function ($task) use ($startOfDay, $endOfDay) {
                return Carbon::parse($task->due_at)->between($startOfDay, $endOfDay);
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
                $monthlyScoreData = $this->getCrewMonthlyScore($crewUser, $month);
                $crewTotalPoints += $monthlyScoreData['total_score'];
                $dailyCrewTotalPoints += $monthlyScoreData['total_score'];
            }
        }

        $scAverageScore = count($scScores) > 0 ? array_sum($scScores) / count($scScores) : 0;
        $avgServiceCrewPoint = $scCount > 0 ? $crewTotalPoints / $scCount : 0;
        $dailyAvgServiceCrewPoint = $scCount > 0 ? $dailyCrewTotalPoints / $scCount : 0;

        $managerLine = $supervisor->leaderLines()->where('status', 'active')->first();
        $managerId = $managerLine ? $managerLine->leader_id : null;

        if ($managerId) {
            $projects = Task::where('employee_id', $supervisor->id)
                ->where('employer_id', $managerId)
                ->whereBetween('due_at', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                ->get();

            $totalProjects = $projects->count();
            $completedProjects = $projects->whereIn('status', ['approved', 'completed'])->count();
            $projectScore = $totalProjects === 0 ? 0 : ($completedProjects / $totalProjects) * 100;
        } else {
            $projectScore = 0;
        }

        $myAvgPoint = (int) round(($scAverageScore * 0.6) + ($projectScore * 0.4));

        return [
            'my_avg_point' => $myAvgPoint,
            'task_for_sc' => [
                'completed' => (int) round($scAverageScore),
                'total' => 100,
                'label' => 'Task for SC',
            ],
            'task_from_manager' => [
                'completed' => (int) round($projectScore),
                'total' => 100,
                'label' => 'Task Completed From SM/RM',
            ],
            'monthly_task_given' => "{$totalTaskGiven} / {$scCount} People",
            'avg_service_crew_point' => (int) round($avgServiceCrewPoint),
            'daily_task_given' => "{$dailyTaskGiven} / {$scCount} People",
            'avg_sc_point_today' => (int) round($dailyAvgServiceCrewPoint),
        ];
    }

    private function collectDailyBreakdown(User $crew, Carbon $startDate, Carbon $endDate): array
    {
        $dailyScores = [];
        $taskScores = [];
        $attendanceScores = [];

        for ($date = $startDate->copy(); $date->lte($endDate); $date->addDay()) {
            if (!$this->isScoringDay($crew, $date)) {
                continue;
            }

            $taskScore = $this->getCrewTaskScoreForDate($crew, $date);
            $attendanceScore = $this->getAttendanceScoreForDate($crew, $date);
            $dailyScores[] = ($taskScore * 0.6) + ($attendanceScore * 0.4);
            $taskScores[] = $taskScore;
            $attendanceScores[] = $attendanceScore;
        }

        return [
            'daily_scores' => $dailyScores,
            'task_scores' => $taskScores,
            'attendance_scores' => $attendanceScores,
        ];
    }

    private function getCrewTaskScoreForDate(User $crew, Carbon $date): float
    {
        $tasks = Task::with('evidences')
            ->where('employee_id', $crew->id)
            ->whereDate('due_at', $date->toDateString())
            ->get();

        if ($tasks->isEmpty()) {
            return 0;
        }

        $taskScores = $tasks->map(function (Task $task) {
            return $this->getTaskScore($task);
        })->all();

        return $this->average($taskScores);
    }

    private function getTaskScore(Task $task): float
    {
        if (!in_array($task->status, ['approved', 'completed'], true)) {
            return 0;
        }

        $beforeCount = $task->evidences->where('type', 'before')->count();
        $afterCount = $task->evidences->where('type', 'after')->count();

        if ($beforeCount !== 1 || $afterCount < 1 || $afterCount > 3) {
            return 0;
        }

        return round(100 / $afterCount, 2);
    }

    private function getAttendanceScoreForDate(User $crew, Carbon $date): float
    {
        $status = $this->getAttendanceStatusForDate($crew, $date);

        return in_array($status, ['H', 'T'], true) ? 100 : 0;
    }

    private function getAttendanceStatusForDate(User $crew, Carbon $date): string
    {
        $attendance = Attendance::where('user_id', $crew->id)
            ->whereDate('date', $date->toDateString())
            ->first();

        if ($attendance) {
            return strtoupper((string) $attendance->status_code);
        }

        return $this->getDummyAttendanceStatus($date);
    }

    private function getDummyAttendanceStatus(Carbon $date): string
    {
        if ($date->isWeekend()) {
            return 'L';
        }

        $hash = ($date->day + ($date->month * 31)) % 7;

        if ($hash === 5) {
            return 'A';
        }

        if ($hash === 4) {
            return 'T';
        }

        return 'H';
    }

    private function isScoringDay(User $crew, Carbon $date): bool
    {
        $status = $this->getAttendanceStatusForDate($crew, $date);

        return !in_array($status, ['S', 'C', 'L'], true);
    }

    private function getPersonalityScoreForMonth(User $crew, Carbon $month): int
    {
        $personality = MonthlyPersonalityEvaluation::where('evaluatee_id', $crew->id)
            ->whereYear('evaluation_period', $month->year)
            ->whereMonth('evaluation_period', $month->month)
            ->first();

        return $personality ? (int) round($personality->score) : 0;
    }

    private function getScoringRangeForMonth(Carbon $month): array
    {
        $startOfMonth = $month->copy()->startOfMonth();
        $endOfMonth = $month->copy()->endOfMonth();
        $today = Carbon::now()->endOfDay();

        if ($startOfMonth->isSameMonth($today) && $startOfMonth->isSameYear($today)) {
            return [$startOfMonth, $today];
        }

        if ($startOfMonth->greaterThan($today)) {
            return [$startOfMonth, $startOfMonth->copy()->subDay()];
        }

        return [$startOfMonth, $endOfMonth];
    }

    private function average(array $values): float
    {
        if (count($values) === 0) {
            return 0;
        }

        return array_sum($values) / count($values);
    }
}
