<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Attendance;
use App\Models\Task;
use App\Models\User;
use App\Services\ScoringService;
use App\Services\YojadwalPresenceService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class SupervisorController extends Controller
{
    public function index(Request $request, ScoringService $scoringService)
    {
        $user = Auth::user();

        if ($user->role_type !== 'supervisor') {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
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
                    ->where('employer_id', $user->username)
                    ->activeOnDate($today)
                    ->count();

                $approvedTasks = Task::where('employee_id', $crew->user_id)
                    ->where('employer_id', $user->username)
                    ->activeOnDate($today)
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
                'id' => $user->username,
                'username' => $user->username,
                'name' => $user->name,
                'role' => 'Supervisor',
                'location' => $user->locations->first() ? $user->locations->first()->name : 'Lokasi tidak diketahui',
            ],
            'location_name' => $user->locations->first() ? $user->locations->first()->name : 'All Locations',
            'location_avg_progress' => round($crews->where('has_tasks', true)->avg('task_progress') ?? 0, 1),
            'crews' => $crews,
        ]);
    }

    public function myStats(Request $request, ScoringService $scoringService, YojadwalPresenceService $presenceService)
    {
        $user = Auth::user();
        $month = $request->query('month', Carbon::now()->month);
        $year = $request->query('year', Carbon::now()->year);

        try {
            $targetDate = Carbon::create($year, $month, 1);
        } catch (\Exception $e) {
            $targetDate = Carbon::now();
        }

        $presenceService->syncMonthIfNeeded($user->username, (int) $targetDate->month, (int) $targetDate->year);

        $detailedStats = $scoringService->getSupervisorMonthlyDetailedScore($user, $targetDate);

        return response()->json($detailedStats);
    }

    public function dashboardSummary(Request $request, ScoringService $scoringService)
    {
        $user = Auth::user();

        if ($user->role_type !== 'supervisor') {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        try {
            $targetDate = $request->filled('date') ? Carbon::parse($request->query('date')) : Carbon::today();
        } catch (\Exception $e) {
            $targetDate = Carbon::today();
        }

        $startOfDay = $targetDate->copy()->startOfDay();
        $endOfDay = $targetDate->copy()->endOfDay();
        $startOfMonth = $targetDate->copy()->startOfMonth();
        $endOfMonth = $targetDate->copy()->endOfMonth();

        $subordinates = $user->subordinateLines()
            ->where('status', 'active')
            ->with('subordinate.locations')
            ->get()
            ->pluck('subordinate')
            ->filter(fn ($crew) => $crew && $crew->active)
            ->values();

        $crewIds = $subordinates->pluck('username')->values();
        $crewCount = $subordinates->count();

        $tasks = Task::with(['assignedTo', 'evidences'])
            ->where('employer_id', $user->username)
            ->whereIn('employee_id', $crewIds)
            ->activeOnDate($targetDate)
            ->get();

        $completedStatuses = ['approved', 'completed'];
        $completedTaskCount = $tasks->whereIn('status', $completedStatuses)->count();
        $totalTaskCount = $tasks->count();

        $assignedCrewCount = $tasks->pluck('employee_id')->unique()->count();
        $unassignedCrewCount = max(0, $crewCount - $assignedCrewCount);

        $crewScores = $subordinates->map(function ($crew) use ($scoringService, $targetDate, $tasks, $completedStatuses) {
            $crewTasks = $tasks->where('employee_id', $crew->username);
            $completed = $crewTasks->whereIn('status', $completedStatuses)->count();
            $score = $scoringService->getCrewMonthlyDetailedStats($crew, $targetDate)['active_percentage'] ?? 0;

            return [
                'id' => $crew->username,
                'name' => $crew->full_name,
                'completed_tasks' => $completed,
                'score' => $score,
            ];
        });

        $teamAverageScore = (int) round($crewScores->avg('score') ?? 0);

        $pendingApprovals = $tasks
            ->filter(fn ($task) => !in_array($task->status, $completedStatuses, true) && $task->evidences->isNotEmpty())
            ->values()
            ->map(fn ($task) => [
                'id' => $task->id,
                'crew_name' => $task->assignedTo?->full_name ?? $task->employee_id,
                'title' => $task->title,
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

    public function getCrewEvalStats($id, Request $request, ScoringService $scoringService, YojadwalPresenceService $presenceService)
    {
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

        $presenceService->syncMonthIfNeeded($crewUser->username, (int) $targetDate->month, (int) $targetDate->year);

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
}
