<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Attendance;
use App\Models\Task;
use App\Models\User;
use App\Services\ScoringService;
use App\Services\SupervisorTaskAccessService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class SupervisorController extends Controller
{
    public function index(
        Request $request,
        ScoringService $scoringService,
        SupervisorTaskAccessService $taskAccess
    )
    {
        $user = Auth::user();

        if ($user->role_type !== 'supervisor') {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        $user->loadMissing('locations');

        $subordinates = $user->subordinateLines()
            ->where('status', 'active')
            ->with(['subordinate.locations', 'subordinate.userLocations'])
            ->get();
        $today = Carbon::today();
        $crewIds = $subordinates->pluck('subordinate_id');
        $backupPairs = $taskAccess->reviewableBackupPairs($user, $crewIds, $today);
        $permanentCrewIds = $subordinates
            ->where('relation_type', 'permanent')
            ->pluck('subordinate_id')
            ->filter()
            ->unique()
            ->values();

        $activeCrews = $subordinates->pluck('subordinate')->filter(function ($crew) {
            return $crew && $crew->active;
        })->values();

        $eloquentCrews = EloquentCollection::make($activeCrews->all());
        if ($eloquentCrews->contains(fn (User $crew) => !empty($crew->role_id))) {
            $eloquentCrews->loadMissing('accountRole');
        }
        if ($eloquentCrews->contains(fn (User $crew) => !empty($crew->job_level_id))) {
            $eloquentCrews->loadMissing('jobLevel');
        }

        $activeCrewIds = $activeCrews->pluck('username')->filter()->unique()->values();
        $metricsByCrew = $scoringService->getCrewDashboardMetricsBatch($activeCrews, Carbon::now(), $today);

        $taskCountsByCrew = collect();
        $latestLogsByCrew = collect();
        if ($activeCrewIds->isNotEmpty()) {
            $taskStatsQuery = Task::whereIn('employee_id', $activeCrewIds)
                ->activeOnDate($today);
            $taskAccess->constrainReviewableTasks($taskStatsQuery, $user, $backupPairs, $permanentCrewIds);
            $taskCountsByCrew = $taskStatsQuery
                ->selectRaw("employee_id, COUNT(*) as total_tasks, SUM(CASE WHEN status IN ('approved', 'completed') THEN 1 ELSE 0 END) as approved_tasks")
                ->groupBy('employee_id')
                ->get()
                ->keyBy('employee_id');

            $latestLogsByCrew = ActivityLog::with('workStation')
                ->whereIn('user_id', $activeCrewIds)
                ->whereDate('created_at', $today)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->get()
                ->unique('user_id')
                ->keyBy('user_id');
        }

        $crews = $activeCrews
            ->map(function ($crew) use ($metricsByCrew, $taskCountsByCrew, $latestLogsByCrew) {
                $metrics = $metricsByCrew[$crew->username] ?? [];
                $score = $metrics['active_percentage'] ?? 0;
                $dailyScore = $metrics['daily_score'] ?? [
                    'score' => null,
                    'score_date' => null,
                    'available' => false,
                    'availability_mode' => 'H',
                    'unavailable_reason' => 'attendance_missing',
                ];

                $taskCountRow = $taskCountsByCrew->get($crew->username);
                $totalTasks = (int) ($taskCountRow->total_tasks ?? 0);
                $approvedTasks = (int) ($taskCountRow->approved_tasks ?? 0);

                $taskProgress = $totalTasks > 0 ? round(($approvedTasks / $totalTasks) * 100, 1) : 0;
                $hasTasks = $totalTasks > 0;

                $latestLog = $latestLogsByCrew->get($crew->username);

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
                    'daily_score' => $dailyScore['score'],
                    'daily_score_date' => $dailyScore['score_date'],
                    'daily_score_available' => $dailyScore['available'],
                    'daily_score_availability_mode' => $dailyScore['availability_mode'],
                    'daily_score_unavailable_reason' => $dailyScore['unavailable_reason'],
                    'activity_percentage' => $score,
                    'task_progress' => $taskProgress,
                    'has_tasks' => $hasTasks,
                    'is_top_performer' => $score > 90,
                ];
            });

        return response()->json([
            'supervisor' => [
                'id' => $user->username,
                'username' => $user->username,
                'name' => $user->name,
                'role' => 'Supervisor',
                'location' => $user->locations->first() ? $user->locations->first()->name : 'Lokasi tidak diketahui',
            ],
            'location_name' => $user->locations->first() ? $user->locations->first()->name : 'Semua Lokasi',
            'location_avg_progress' => round($crews->where('has_tasks', true)->avg('task_progress') ?? 0, 1),
            'crews' => $crews,
        ]);
    }

    public function myStats(Request $request, ScoringService $scoringService)
    {
        $request->validate([
            'month' => 'nullable|integer|between:1,12',
            'year' => 'nullable|integer|between:2000,2100',
        ]);

        $user = Auth::user();
        if ($user->role_type !== 'supervisor') {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

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

    public function dashboardSummary(
        Request $request,
        ScoringService $scoringService,
        SupervisorTaskAccessService $taskAccess
    )
    {
        $request->validate([
            'date' => 'nullable|date_format:Y-m-d',
        ]);

        $user = Auth::user();

        if ($user->role_type !== 'supervisor') {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        try {
            $targetDate = $request->filled('date') ? Carbon::parse($request->query('date')) : Carbon::today();
        } catch (\Exception $e) {
            $targetDate = Carbon::today();
        }

        $user->loadMissing('locations');

        $startOfMonth = $targetDate->copy()->startOfMonth();
        $endOfMonth = $targetDate->copy()->endOfMonth();

        $subordinateLines = $user->subordinateLines()
            ->where('status', 'active')
            ->with('subordinate.locations')
            ->get();
        $permanentCrewIds = $subordinateLines
            ->where('relation_type', 'permanent')
            ->pluck('subordinate_id')
            ->filter()
            ->unique()
            ->values();
        $subordinates = $subordinateLines
            ->pluck('subordinate')
            ->filter(fn ($crew) => $crew && $crew->active)
            ->values();

        $crewIds = $subordinates->pluck('username')->values();
        $crewCount = $subordinates->count();
        $backupPairs = $taskAccess->reviewableBackupPairs($user, $crewIds, $targetDate);

        $taskQuery = Task::with(['assignedTo', 'evidences'])
            ->whereIn('employee_id', $crewIds)
            ->activeOnDate($targetDate);
        $taskAccess->constrainReviewableTasks($taskQuery, $user, $backupPairs, $permanentCrewIds);
        $tasks = $taskQuery->get();

        $completedStatuses = ['approved', 'completed'];
        $completedTaskCount = $tasks->whereIn('status', $completedStatuses)->count();
        $totalTaskCount = $tasks->count();

        $assignedCrewCount = $tasks->pluck('employee_id')->unique()->count();
        $unassignedCrewCount = max(0, $crewCount - $assignedCrewCount);

        $metricsByCrew = $scoringService->getCrewDashboardMetricsBatch($subordinates, $targetDate, null);

        $crewScores = $subordinates->map(function ($crew) use ($metricsByCrew, $tasks, $completedStatuses) {
            $crewTasks = $tasks->where('employee_id', $crew->username);
            $completed = $crewTasks->whereIn('status', $completedStatuses)->count();
            $score = $metricsByCrew[$crew->username]['active_percentage'] ?? 0;

            return [
                'id' => $crew->username,
                'name' => $crew->full_name,
                'completed_tasks' => $completed,
                'score' => $score,
            ];
        });

        $teamAverageScore = (int) round($crewScores->avg('score') ?? 0);

        $workloadMonitor = $subordinates->map(function ($crew) use ($tasks) {
            $crewTasks = $tasks->where('employee_id', $crew->username);

            return [
                'id' => $crew->username,
                'name' => $crew->full_name,
                'task_count' => $crewTasks->count(),
                'total_weight' => 0,
                'average_weight' => 0,
            ];
        })
            ->sortByDesc('task_count')
            ->values();

        $pendingApprovals = $tasks
            ->filter(fn ($task) => !in_array($task->status, $completedStatuses, true) && $task->evidences->isNotEmpty())
            ->values()
            ->map(fn ($task) => [
                'id' => $task->id,
                'crew_name' => $task->assignedTo?->full_name ?? $task->employee_id,
                'title' => $task->title,
                'start_at' => optional($task->start_at)->toDateTimeString(),
                'due_at' => optional($task->due_at)->toDateTimeString(),
            ]);

        $attendanceRows = Attendance::whereIn('user_id', $crewIds)
            ->whereBetween('date', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
            ->get()
            ->groupBy('user_id');

        $attendanceMonitor = $subordinates->map(function ($crew) use ($attendanceRows) {
            $summary = [
                'no_absen' => 0,
                'telat' => 0,
                'izin' => 0,
                'sakit' => 0,
            ];

            foreach ($attendanceRows->get($crew->username, collect()) as $attendance) {
                $code = strtoupper((string) $attendance->status_code);
                if (in_array($code, ['T', 'TELAT', 'LATE'], true)) $summary['telat']++;
                elseif (in_array($code, ['I', 'IZIN', 'PS'], true)) $summary['izin']++;
                elseif (in_array($code, ['S', 'SAKIT', 'SD'], true)) $summary['sakit']++;
                elseif ($code === '') $summary['no_absen']++;
            }

            return [
                'id' => $crew->username,
                'name' => $crew->full_name,
                'no_absen' => $summary['no_absen'],
                'telat' => $summary['telat'],
                'izin' => $summary['izin'],
                'sakit' => $summary['sakit'],
            ];
        })
            ->sortByDesc(fn ($row) => $row['no_absen'] + $row['telat'] + $row['izin'] + $row['sakit'])
            ->values()
            ->take(5);

        return response()->json([
            'date' => $targetDate->toDateString(),
            'location' => [
                'name' => $user->locations->first()?->name ?? 'Lokasi tidak diketahui',
                'initial' => $user->locations->first()?->initial,
            ],
            'supervisor' => [
                'name' => $user->name,
            ],
            'cards' => [
                'team_task_progress' => [
                    'completed' => $completedTaskCount,
                    'total' => $totalTaskCount,
                ],
                'unassigned_crews' => [
                    'count' => $unassignedCrewCount,
                    'total' => $crewCount,
                ],
                'team_average_score' => $teamAverageScore,
                'today_total_tasks' => $totalTaskCount,
            ],
            'top_performers' => $crewScores
                ->sortByDesc('completed_tasks')
                ->values()
                ->take(5),
            'pending_approvals' => $pendingApprovals->take(8),
            'attendance_monitor' => $attendanceMonitor,
            'workload_monitor' => $workloadMonitor,
            'notifications' => [
                [
                    'id' => 'pending-approvals',
                    'title' => 'Persetujuan',
                    'message' => "Anda memiliki {$pendingApprovals->count()} pekerjaan yang harus disetujui.",
                    'description' => 'Pekerjaan telah dilakukan oleh bawahan Anda.',
                    'unread' => $pendingApprovals->count() > 0,
                ],
            ],
        ]);
    }

    public function getCrewEvalStats($id, Request $request, ScoringService $scoringService)
    {
        $request->validate([
            'month' => 'nullable|integer|between:1,12',
            'year' => 'nullable|integer|between:2000,2100',
        ]);

        $user = Auth::user();
        if ($user->role_type !== 'supervisor' && $user->role_type !== 'manager') {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        $crewUser = User::where('username', $id)->first();
        if (!$crewUser) {
            return response()->json(['message' => 'Crew tidak ditemukan.'], 404);
        }

        $isSubordinate = $user->subordinateLines()->where('subordinate_id', $id)->where('status', 'active')->exists();
        if (!$isSubordinate) {
            return response()->json(['message' => 'Tidak memiliki akses. Anda hanya dapat melihat statistik bawahan Anda.'], 403);
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
            'attendance_calendar' => $detailedStats['attendance_calendar'],
            'yearly_score' => $yearlyScore,
        ]);
    }

    public function teamDailyScores(Request $request, ScoringService $scoringService)
    {
        $supervisor = $this->authorizedSupervisor();
        [$startDate, $endDate] = $this->dailyReportPeriod($request);

        $team = $this->permanentTeam($supervisor);
        $reports = $scoringService->getCrewDailyReportsBatch($team, $startDate, $endDate);

        $members = $team->map(function (User $crew) use ($reports) {
            $report = $reports[$crew->username] ?? ['summary' => [
                'approved_tasks' => 0,
                'unapproved_tasks' => 0,
                'score' => null,
                'available_days' => 0,
            ]];

            return [
                'id' => $crew->username,
                'name' => $crew->full_name,
                ...$report['summary'],
            ];
        });

        return response()->json([
            'mode' => 'daily',
            'period' => [
                'start' => $startDate->toDateString(),
                'end' => $endDate->toDateString(),
            ],
            'members' => $members,
        ]);
    }

    public function teamDailyScoreDetail(string $crew, Request $request, ScoringService $scoringService)
    {
        $supervisor = $this->authorizedSupervisor();
        [$startDate, $endDate] = $this->dailyReportPeriod($request);
        $member = $this->permanentTeamMember($supervisor, $crew);
        $report = $scoringService->getCrewDailyReport($member, $startDate, $endDate);

        return response()->json([
            'mode' => 'daily',
            'member' => ['id' => $member->username, 'name' => $member->full_name],
            'period' => [
                'start' => $startDate->toDateString(),
                'end' => $endDate->toDateString(),
            ],
            ...$report,
        ]);
    }

    public function teamMonthlyScores(Request $request, ScoringService $scoringService)
    {
        $supervisor = $this->authorizedSupervisor();
        [$startMonth, $endMonth] = $this->monthlyReportPeriod($request);

        $team = $this->permanentTeam($supervisor);
        $reports = $scoringService->getCrewMonthlyReportsBatch($team, $startMonth, $endMonth);

        $members = $team->map(function (User $crew) use ($reports) {
            $report = $reports[$crew->username] ?? ['summary' => [
                'task_score' => 0.0,
                'attendance_score' => 0.0,
                'evaluation_score' => 0.0,
                'total_score' => 0.0,
            ]];

            return [
                'id' => $crew->username,
                'name' => $crew->full_name,
                ...$report['summary'],
            ];
        });

        return response()->json([
            'mode' => 'monthly',
            'period' => [
                'start' => $startMonth->format('Y-m'),
                'end' => $endMonth->format('Y-m'),
            ],
            'members' => $members,
        ]);
    }

    public function teamMonthlyScoreDetail(string $crew, Request $request, ScoringService $scoringService)
    {
        $supervisor = $this->authorizedSupervisor();
        [$startMonth, $endMonth] = $this->monthlyReportPeriod($request);
        $member = $this->permanentTeamMember($supervisor, $crew);
        $report = $scoringService->getCrewMonthlyReport($member, $startMonth, $endMonth);

        return response()->json([
            'mode' => 'monthly',
            'member' => ['id' => $member->username, 'name' => $member->full_name],
            'period' => [
                'start' => $startMonth->format('Y-m'),
                'end' => $endMonth->format('Y-m'),
            ],
            ...$report,
        ]);
    }

    private function authorizedSupervisor(): User
    {
        $user = Auth::user();
        abort_unless($user && $user->role_type === 'supervisor', 403, 'Tidak memiliki akses.');

        return $user;
    }

    private function permanentTeam(User $supervisor)
    {
        return $supervisor->subordinateLines()
            ->where('status', 'active')
            ->where('relation_type', 'permanent')
            ->with('subordinate')
            ->get()
            ->pluck('subordinate')
            ->filter(fn($crew) => $crew && $crew->active)
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();
    }

    private function permanentTeamMember(User $supervisor, string $crew): User
    {
        $member = $this->permanentTeam($supervisor)->firstWhere('username', $crew);
        abort_unless($member, 403, 'Karyawan bukan bawahan permanen aktif Anda.');

        return $member;
    }

    private function dailyReportPeriod(Request $request): array
    {
        $validated = $request->validate([
            'start_date' => 'required|date_format:Y-m-d',
            'end_date' => 'required|date_format:Y-m-d|after_or_equal:start_date|before_or_equal:today',
        ]);

        $startDate = Carbon::createFromFormat('Y-m-d', $validated['start_date'])->startOfDay();
        $endDate = Carbon::createFromFormat('Y-m-d', $validated['end_date'])->startOfDay();

        if ($startDate->diffInDays($endDate) > 30) {
            throw ValidationException::withMessages([
                'end_date' => 'Rentang nilai harian maksimal 31 hari kalender.',
            ]);
        }

        return [$startDate, $endDate];
    }

    private function monthlyReportPeriod(Request $request): array
    {
        $validated = $request->validate([
            'start_month' => ['required', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'end_month' => ['required', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
        ]);

        $startMonth = Carbon::createFromFormat('!Y-m', $validated['start_month'])->startOfMonth();
        $endMonth = Carbon::createFromFormat('!Y-m', $validated['end_month'])->startOfMonth();

        if ($endMonth->lt($startMonth)) {
            throw ValidationException::withMessages([
                'end_month' => 'Bulan selesai harus sama atau setelah bulan mulai.',
            ]);
        }

        if ($endMonth->gte(Carbon::today()->startOfMonth())) {
            throw ValidationException::withMessages([
                'end_month' => 'Laporan bulanan hanya tersedia untuk bulan yang sudah selesai.',
            ]);
        }

        if ($startMonth->diffInMonths($endMonth) > 11) {
            throw ValidationException::withMessages([
                'end_month' => 'Rentang nilai bulanan maksimal 12 bulan.',
            ]);
        }

        return [$startMonth, $endMonth];
    }
}
