<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\GuideRead;
use App\Models\MonthlyOverallScore;
use App\Models\MonthlyPersonalityEvaluation;
use App\Models\ScoringRule;
use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class ScoringService
{
    public function getCrewDailyScore(User $crew, Carbon $date): int
    {
        $display = $this->getCrewDailyScoreDisplay($crew, $date);

        return (int) ($display['score'] ?? 0);
    }

    public function getCrewDailyScoreDisplay(User $crew, Carbon $displayDate, string $category = 'service_crew'): array
    {
        $normalizedCategory = strtolower(trim($category));
        $isCashier = $normalizedCategory === 'cashier';
        $scoreDate = $isCashier ? $displayDate->copy()->subDay() : $displayDate->copy();

        if ($isCashier) {
            return [
                'category' => 'cashier',
                'score' => null,
                'score_date' => $scoreDate->toDateString(),
                'available' => false,
                'availability_mode' => 'H+1',
                'unavailable_reason' => 'cashier_integration_pending',
            ];
        }

        $rule = ScoringRule::configurationFor($scoreDate);
        $status = $this->getAttendanceStatusForDate($crew, $scoreDate);

        if ($status === null) {
            $tasks = $this->getCrewTasksForDate($crew, $scoreDate);
            if ($tasks->isNotEmpty()) {
                return [
                    'category' => 'service_crew',
                    'score' => (int) round($this->getCrewTaskScore($tasks)),
                    'score_date' => $scoreDate->toDateString(),
                    'available' => true,
                    'availability_mode' => 'H',
                    'unavailable_reason' => null,
                ];
            }

            return [
                'category' => 'service_crew',
                'score' => null,
                'score_date' => $scoreDate->toDateString(),
                'available' => false,
                'availability_mode' => 'H',
                'unavailable_reason' => 'attendance_missing',
            ];
        }

        if ($this->isTaskExcludedStatus($status, $rule)) {
            return [
                'category' => 'service_crew',
                'score' => null,
                'score_date' => $scoreDate->toDateString(),
                'available' => false,
                'availability_mode' => 'H',
                'unavailable_reason' => 'non_working_day',
            ];
        }

        return [
            'category' => 'service_crew',
            'score' => (int) round($this->getCrewTaskScoreForDate($crew, $scoreDate)),
            'score_date' => $scoreDate->toDateString(),
            'available' => true,
            'availability_mode' => 'H',
            'unavailable_reason' => null,
        ];
    }

    public function getCrewMonthlyScore(User $crew, Carbon $month): array
    {
        [$startOfMonth, $endOfRange] = $this->getScoringRangeForMonth($month);
        $rule = ScoringRule::configurationFor($month);

        if ($endOfRange->lt($startOfMonth)) {
            return [
                'daily_average_score' => 0,
                'task_score' => 0,
                'attendance_score' => 0,
                'personality_score' => 0,
                'total_score' => 0,
                'scoring_rule_id' => $rule['id'],
                'scoring_rule_effective_from' => $rule['effective_from'],
            ];
        }

        $dailyBreakdown = $this->collectDailyBreakdown($crew, $startOfMonth, $endOfRange, $rule);
        $dailyAverage = $this->average($dailyBreakdown['daily_scores']);
        $taskAverage = $this->average($dailyBreakdown['task_scores']);
        $attendanceAverage = $this->calculateAttendanceScore(
            $dailyBreakdown['attendance_statuses'],
            $rule['attendance_included_statuses'],
            $rule['attendance_target']
        );
        $personalityScore = $this->getPersonalityScoreForMonth($crew, $month);
        $totalScore = $this->calculateCrewMonthlyTotal(
            $taskAverage,
            $attendanceAverage,
            $personalityScore,
            $rule
        );

        return [
            'daily_average_score' => round($dailyAverage, 2),
            'task_score' => round($taskAverage, 2),
            'attendance_score' => round($attendanceAverage, 2),
            'personality_score' => $personalityScore,
            'total_score' => $totalScore,
            'attendance_count' => $this->countIncludedAttendanceStatuses($dailyBreakdown['attendance_statuses'], $rule['attendance_included_statuses']),
            'attendance_target' => $rule['attendance_target'],
            'missing_attendance_dates' => $dailyBreakdown['missing_attendance_dates'],
            'scoring_rule_id' => $rule['id'],
            'scoring_rule_effective_from' => $rule['effective_from'],
        ];
    }

    public function getCrewMonthlyDetailedStats(User $crew, Carbon $month): array
    {
        [$startOfMonth, $endOfRange] = $this->getScoringRangeForMonth($month);
        $rule = ScoringRule::configurationFor($month);
        $dailyBreakdown = $endOfRange->lt($startOfMonth)
            ? ['daily_scores' => []]
            : $this->collectDailyBreakdown($crew, $startOfMonth, $endOfRange, $rule);

        $guideReads = $endOfRange->lt($startOfMonth)
            ? collect()
            : GuideRead::with('workStation')
                ->where('user_id', $crew->username)
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
            'attendance_calendar' => $this->getAttendanceCalendarForMonth($crew, $month),
        ];
    }

    public function getCrewDailyReport(User $crew, Carbon $startDate, Carbon $endDate): array
    {
        $attendanceByDate = Attendance::where('user_id', $crew->username)
            ->whereBetween('date', [$startDate->toDateString(), $endDate->toDateString()])
            ->get()
            ->keyBy(fn(Attendance $attendance) => Carbon::parse($attendance->date)->toDateString());

        $tasksByDate = Task::with('evidences')
            ->where('employee_id', $crew->username)
            ->whereBetween('due_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->get()
            ->groupBy(fn(Task $task) => Carbon::parse($task->due_at)->toDateString());

        $rows = [];
        $scores = [];
        $approvedTotal = 0;
        $unapprovedTotal = 0;

        for ($date = $startDate->copy(); $date->lte($endDate); $date->addDay()) {
            $dateKey = $date->toDateString();
            $attendance = $attendanceByDate->get($dateKey);
            $attendanceStatus = $attendance
                ? strtoupper(trim((string) $attendance->status_code))
                : null;
            $tasks = $tasksByDate->get($dateKey, collect());
            $approved = $tasks->whereIn('status', ['approved', 'completed'])->count();
            $unapproved = $tasks->count() - $approved;
            $available = true;
            $unavailableReason = null;
            $score = null;

            if ($attendanceStatus === null && $tasks->isEmpty()) {
                $available = false;
                $unavailableReason = 'attendance_missing';
            } elseif ($attendanceStatus !== null && $this->isTaskExcludedStatus(
                $attendanceStatus,
                ScoringRule::configurationFor($date)
            )) {
                $available = false;
                $unavailableReason = 'non_working_day';
            } else {
                $score = round($this->getCrewTaskScore($tasks), 2);
                $scores[] = $score;
            }

            $approvedTotal += $approved;
            $unapprovedTotal += $unapproved;
            $rows[] = [
                'date' => $dateKey,
                'attendance_status' => $attendanceStatus,
                'approved_tasks' => $approved,
                'unapproved_tasks' => $unapproved,
                'score' => $score,
                'available' => $available,
                'unavailable_reason' => $unavailableReason,
            ];
        }

        return [
            'summary' => [
                'approved_tasks' => $approvedTotal,
                'unapproved_tasks' => $unapprovedTotal,
                'score' => $scores === [] ? null : round($this->average($scores), 2),
                'available_days' => count($scores),
            ],
            'rows' => $rows,
        ];
    }

    public function getCrewMonthlyReport(User $crew, Carbon $startMonth, Carbon $endMonth): array
    {
        $rows = [];

        for ($month = $startMonth->copy()->startOfMonth(); $month->lte($endMonth); $month->addMonth()) {
            $score = $this->getCrewMonthlyScore($crew, $month);
            $rows[] = [
                'month' => $month->format('Y-m'),
                'task_score' => $score['task_score'],
                'attendance_score' => $score['attendance_score'],
                'evaluation_score' => $score['personality_score'],
                'total_score' => $score['total_score'],
                'missing_attendance_dates' => $score['missing_attendance_dates'] ?? [],
                'scoring_rule_id' => $score['scoring_rule_id'],
                'scoring_rule_effective_from' => $score['scoring_rule_effective_from'],
            ];
        }

        return [
            'summary' => [
                'task_score' => round($this->average(array_column($rows, 'task_score')), 2),
                'attendance_score' => round($this->average(array_column($rows, 'attendance_score')), 2),
                'evaluation_score' => round($this->average(array_column($rows, 'evaluation_score')), 2),
                'total_score' => round($this->average(array_column($rows, 'total_score')), 2),
            ],
            'rows' => $rows,
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

        $monthsToCalculate = $this->completedMonthsInYear($targetYear, $currentYear, $currentMonth);

        $snapshots = MonthlyOverallScore::where('user_id', $crew->username)
            ->whereYear('period', $targetYear)
            ->get()
            ->keyBy(function ($item) {
                return $item->period->format('Y-m-d');
            });

        $totalScore = 0;

        for ($month = 1; $month <= $monthsToCalculate; $month++) {
            $monthDate = Carbon::create($targetYear, $month, 1);
            $periodKey = $monthDate->toDateString();

            if ($snapshots->has($periodKey)) {
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
            $monthlyTasks = Task::where('employer_id', $supervisor->username)
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

            $crewUser = User::where('username', $line->subordinate_id)->first();
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

        $managerReviewScore = 0;
        if ($managerId) {
            $managerReview = MonthlyPersonalityEvaluation::where('evaluatee_id', $supervisor->username)
                ->where('evaluator_id', $managerId)
                ->where('evaluation_type', 'manager_review')
                ->whereYear('evaluation_period', $month->year)
                ->whereMonth('evaluation_period', $month->month)
                ->first();

            $managerReviewScore = $managerReview ? (float) $managerReview->score : 0;
        }

        $myAvgPoint = (int) round(($scAverageScore * 0.6) + ($managerReviewScore * 0.4));

        return [
            'my_avg_point' => $myAvgPoint,
            'task_for_sc' => [
                'completed' => (int) round($scAverageScore),
                'total' => 100,
                'label' => 'Pekerjaan untuk SC',
            ],
            'task_from_manager' => [
                'completed' => (int) round($managerReviewScore),
                'total' => 100,
                'label' => 'Penilaian Manager',
            ],
            'monthly_task_given' => "{$totalTaskGiven} / {$scCount} Orang",
            'avg_service_crew_point' => (int) round($avgServiceCrewPoint),
            'daily_task_given' => "{$dailyTaskGiven} / {$scCount} Orang",
            'avg_sc_point_today' => (int) round($dailyAvgServiceCrewPoint),
            'attendance_calendar' => $this->getAttendanceCalendarForMonth($supervisor, $month),
        ];
    }

    public function getAttendanceCalendarForMonth(User $user, Carbon $month): array
    {
        $startOfMonth = $month->copy()->startOfMonth();
        $endOfMonth = $month->copy()->endOfMonth();
        $today = Carbon::today();

        $attendanceByDate = Attendance::where('user_id', $user->username)
            ->whereBetween('date', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
            ->get()
            ->keyBy(function ($attendance) {
                return Carbon::parse($attendance->date)->toDateString();
            });

        $calendar = [];
        for ($date = $startOfMonth->copy(); $date->lte($endOfMonth); $date->addDay()) {
            $dateKey = $date->toDateString();
            $attendance = $attendanceByDate->get($dateKey);

            if ($date->gt($today)) {
                $status = null;
                $source = 'future';
            } elseif ($attendance) {
                $status = strtoupper((string) $attendance->status_code);
                $source = 'attendance';
            } else {
                $status = null;
                $source = 'missing';
            }

            $calendar[] = [
                'date' => $dateKey,
                'day' => $date->day,
                'status_code' => $status,
                'source' => $source,
            ];
        }

        return $calendar;
    }

    private function collectDailyBreakdown(User $crew, Carbon $startDate, Carbon $endDate, array $rule): array
    {
        $dailyScores = [];
        $taskScores = [];
        $attendanceStatuses = [];
        $missingAttendanceDates = [];

        $attendanceByDate = Attendance::where('user_id', $crew->username)
            ->whereBetween('date', [$startDate->toDateString(), $endDate->toDateString()])
            ->get()
            ->keyBy(fn(Attendance $attendance) => Carbon::parse($attendance->date)->toDateString());

        $tasksByDate = Task::with('evidences')
            ->where('employee_id', $crew->username)
            ->whereBetween('due_at', [$startDate->copy()->startOfDay(), $endDate->copy()->endOfDay()])
            ->get()
            ->groupBy(fn(Task $task) => Carbon::parse($task->due_at)->toDateString());

        for ($date = $startDate->copy(); $date->lte($endDate); $date->addDay()) {
            $dateKey = $date->toDateString();
            $attendance = $attendanceByDate->get($dateKey);

            if (!$attendance) {
                $missingAttendanceDates[] = $dateKey;
                continue;
            }

            $attendanceStatus = strtoupper(trim((string) $attendance->status_code));
            $attendanceStatuses[] = $attendanceStatus;

            if ($this->isTaskExcludedStatus($attendanceStatus, $rule)) {
                continue;
            }

            $tasks = $tasksByDate->get($dateKey, collect());
            $taskScore = $tasks->isEmpty()
                ? 0
                : $this->average($tasks->map(fn(Task $task) => $this->getTaskScore($task))->all());
            $dailyScores[] = $taskScore;
            $taskScores[] = $taskScore;
        }

        return [
            'daily_scores' => $dailyScores,
            'task_scores' => $taskScores,
            'attendance_statuses' => $attendanceStatuses,
            'missing_attendance_dates' => $missingAttendanceDates,
        ];
    }

    private function getCrewTaskScoreForDate(User $crew, Carbon $date): float
    {
        return $this->getCrewTaskScore($this->getCrewTasksForDate($crew, $date));
    }

    private function getCrewTasksForDate(User $crew, Carbon $date): Collection
    {
        return Task::with('evidences')
            ->where('employee_id', $crew->username)
            ->whereDate('due_at', $date->toDateString())
            ->get();
    }

    private function getCrewTaskScore(Collection $tasks): float
    {
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
        $photoCount = $beforeCount + $afterCount;

        if ($task->getRawOriginal('revision_deadline_at')) {
            if ($beforeCount === 0) {
                return 0;
            }

            $approvedAfter = $task->evidences
                ->where('type', 'after')
                ->where('review_status', 'approved')
                ->sortByDesc('attempt_no')
                ->first();

            if (!$approvedAfter) {
                return 0;
            }

            return (float) ($approvedAfter->awarded_score
                ?? config('task_review.attempt_scores.' . $approvedAfter->attempt_no, 0));
        }

        if ($photoCount < 1) {
            return 0;
        }

        if ($beforeCount === 0 || $afterCount === 0) {
            return 50;
        }

        if ($photoCount <= 2) {
            return round(($photoCount / 2) * 100, 2);
        }

        return round((2 / $photoCount) * 100, 2);
    }

    public function calculateAttendanceScore(array $statuses, array $includedStatuses, int $target): float
    {
        if ($target <= 0) {
            return 0;
        }

        $count = $this->countIncludedAttendanceStatuses($statuses, $includedStatuses);

        return min(100, round(($count / $target) * 100, 2));
    }

    public function calculateIbopScore(?int $totalQuantity): ?int
    {
        return $this->calculateBandScore(
            $totalQuantity,
            $this->scoringConfig('ibop_bands', $this->defaultIbopBands())
        );
    }

    public function calculatePushSellingScore(?int $totalQuantity): ?int
    {
        return $this->calculateBandScore(
            $totalQuantity,
            $this->scoringConfig('push_selling_bands', $this->defaultPushSellingBands())
        );
    }

    public function calculateCashierTaskScore(
        ?float $monthlyTaskScore,
        ?float $ibopScore,
        ?float $pushSellingScore,
        ?array $rule = null
    ): ?float {
        if ($monthlyTaskScore === null || $ibopScore === null || $pushSellingScore === null) {
            return null;
        }

        $rule ??= $this->defaultRule();

        return round(
            ($monthlyTaskScore * ((float) $rule['cashier_task_weight'] / 100))
            + ($ibopScore * ((float) $rule['cashier_ibop_weight'] / 100))
            + ($pushSellingScore * ((float) $rule['cashier_push_selling_weight'] / 100)),
            2
        );
    }

    private function getAttendanceStatusForDate(User $crew, Carbon $date): ?string
    {
        $attendance = Attendance::where('user_id', $crew->username)
            ->whereDate('date', $date->toDateString())
            ->first();

        if ($attendance) {
            return strtoupper(trim((string) $attendance->status_code));
        }

        return null;
    }

    private function isTaskExcludedStatus(string $status, array $rule): bool
    {
        $excluded = array_map(
            fn($item) => strtoupper(trim((string) $item)),
            $rule['task_excluded_statuses'] ?? []
        );

        return in_array(strtoupper(trim($status)), $excluded, true);
    }

    private function getPersonalityScoreForMonth(User $crew, Carbon $month): int
    {
        $personality = MonthlyPersonalityEvaluation::where('evaluatee_id', $crew->username)
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

    private function completedMonthsInYear(int $targetYear, int $currentYear, int $currentMonth): int
    {
        if ($targetYear > $currentYear) {
            return 0;
        }

        return $targetYear === $currentYear ? max(0, $currentMonth - 1) : 12;
    }

    private function calculateCrewMonthlyTotal(
        float $taskScore,
        float $attendanceScore,
        float $personalityScore,
        ?array $rule = null
    ): int {
        $rule ??= $this->defaultRule();

        return (int) round(
            ($taskScore * ((float) $rule['task_weight'] / 100))
            + ($attendanceScore * ((float) $rule['attendance_weight'] / 100))
            + ($personalityScore * ((float) $rule['evaluation_weight'] / 100))
        );
    }

    private function countIncludedAttendanceStatuses(array $statuses, array $includedStatuses): int
    {
        $included = array_map(fn($status) => strtoupper(trim((string) $status)), $includedStatuses);

        return count(array_filter(
            $statuses,
            fn($status) => in_array(strtoupper(trim((string) $status)), $included, true)
        ));
    }

    private function calculateBandScore(?int $quantity, array $bands): ?int
    {
        if ($quantity === null) {
            return null;
        }

        foreach ($bands as $band) {
            if ($quantity >= (int) $band['min']) {
                return (int) $band['score'];
            }
        }

        return 0;
    }

    private function defaultRule(): array
    {
        return [
            'task_weight' => 60,
            'attendance_weight' => 25,
            'evaluation_weight' => 15,
            'attendance_target' => 25,
            'attendance_included_statuses' => ['H', 'O', 'OP', 'CT'],
            'task_excluded_statuses' => ['O', 'OP', 'CT'],
            'cashier_task_weight' => 33.3333,
            'cashier_ibop_weight' => 33.3333,
            'cashier_push_selling_weight' => 33.3334,
        ];
    }

    private function scoringConfig(string $key, mixed $fallback): mixed
    {
        try {
            return config("scoring.{$key}", $fallback);
        } catch (\Throwable) {
            return $fallback;
        }
    }

    private function defaultIbopBands(): array
    {
        return [
            ['min' => 30000, 'score' => 100],
            ['min' => 25000, 'score' => 90],
            ['min' => 20000, 'score' => 80],
            ['min' => 15000, 'score' => 70],
            ['min' => 10000, 'score' => 60],
            ['min' => 5000, 'score' => 50],
            ['min' => 2000, 'score' => 40],
            ['min' => 1000, 'score' => 30],
            ['min' => 1, 'score' => 20],
            ['min' => 0, 'score' => 0],
        ];
    }

    private function defaultPushSellingBands(): array
    {
        return [
            ['min' => 1250, 'score' => 100],
            ['min' => 1000, 'score' => 95],
            ['min' => 750, 'score' => 85],
            ['min' => 500, 'score' => 75],
            ['min' => 250, 'score' => 65],
            ['min' => 100, 'score' => 50],
            ['min' => 0, 'score' => 40],
        ];
    }
}
