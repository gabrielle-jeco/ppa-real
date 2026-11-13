<?php

namespace App\Services;

use App\Models\Location;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CmsScoreReportService
{
    public const GROUPS_PER_PAGE = 20;

    public function report(string $mode, array $filters, int $page = 1): array
    {
        $locations = $this->locations($filters);
        $groups = $this->groups($mode, $filters, $locations);
        $lastPage = max(1, (int) ceil($groups->count() / self::GROUPS_PER_PAGE));
        $currentPage = min(max(1, $page), $lastPage);

        return [
            'mode' => $mode,
            'period' => [
                'start' => $filters['start'],
                'end' => $filters['end'],
            ],
            'summary' => $this->summary($locations),
            'groups' => $groups
                ->forPage($currentPage, self::GROUPS_PER_PAGE)
                ->values(),
            'pagination' => [
                'current_page' => $currentPage,
                'last_page' => $lastPage,
                'per_page' => self::GROUPS_PER_PAGE,
                'total' => $groups->count(),
            ],
        ];
    }

    public function groups(string $mode, array $filters, ?Collection $locations = null): Collection
    {
        $locations ??= $this->locations($filters);
        $locationIds = $locations->pluck('initial')->all();

        if ($locationIds === []) {
            return collect();
        }

        return $mode === 'monthly'
            ? $this->monthlyGroups($filters, $locationIds)
            : $this->dailyGroups($filters, $locationIds);
    }

    public function details(string $mode, array $filters, ?string $leaderId, string $locationId): Collection
    {
        $locations = $this->locations($filters);
        abort_unless($locations->contains('initial', $locationId), 404, 'Cabang tidak tersedia pada filter ini.');

        return $mode === 'monthly'
            ? $this->monthlyDetails($filters, $leaderId, $locationId)
            : $this->dailyDetails($filters, $leaderId, $locationId);
    }

    public function exportRows(string $mode, array $filters): Collection
    {
        $locationIds = $this->locations($filters)->pluck('initial')->all();
        if ($locationIds === []) {
            return collect();
        }

        return $mode === 'monthly'
            ? $this->monthlyRows($filters, $locationIds)
            : $this->dailyRows($filters, $locationIds);
    }

    public function locations(array $filters): Collection
    {
        return Location::query()
            ->where('is_active', true)
            ->when($filters['regional'] ?? null, fn($query, $regional) => $query->where('region_code', (int) $regional))
            ->when($filters['location'] ?? null, fn($query, $location) => $query->where('initial', $location))
            ->orderBy('name')
            ->get(['initial', 'name', 'region_code']);
    }

    private function summary(Collection $locations): array
    {
        $locationIds = $locations->pluck('initial')->all();
        if ($locationIds === []) {
            return [
                'total_employees' => 0,
                'store_managers' => [],
                'chief_operations' => [],
                'supervisors' => 0,
                'non_staff' => 0,
            ];
        }

        $operationalUsers = DB::table('user_locations')
            ->join('users', 'users.username', '=', 'user_locations.user_id')
            ->where('users.active', true)
            ->whereIn('user_locations.location_id', $locationIds)
            ->whereIn(DB::raw('LOWER(TRIM(user_locations.job_level))'), ['sc', 'supervisor', 'manager', 'regional_manager']);

        $managers = DB::table('users')
            ->join('job_levels', 'job_levels.id', '=', 'users.job_level_id')
            ->join('locations', 'locations.initial', '=', 'users.initial_store')
            ->where('users.active', true)
            ->whereIn('users.initial_store', $locationIds)
            ->get([
                'users.username as id',
                'users.name',
                'users.initial_store as location_id',
                'locations.name as location_name',
                'job_levels.name as job_level_name',
                'job_levels.position_code',
            ]);

        $formatPeople = fn(Collection $people) => $people
            ->map(fn($person) => [
                'id' => $person->id,
                'name' => $person->name,
                'location_id' => $person->location_id,
                'location_name' => $person->location_name,
            ])
            ->values()
            ->all();

        $isStoreManager = fn($person) => str_contains(strtoupper((string) $person->job_level_name), 'STORE MANAGER')
            || str_starts_with(strtoupper((string) $person->position_code), 'SM-')
            || str_starts_with(strtoupper((string) $person->position_code), 'SMP-');
        $isChiefOperation = fn($person) => str_contains(strtoupper((string) $person->job_level_name), 'CHIEF OPERATION')
            || str_starts_with(strtoupper((string) $person->position_code), 'CF-OPR-CAB-');

        return [
            'total_employees' => (clone $operationalUsers)
                ->pluck('users.username')
                ->merge($managers->pluck('id'))
                ->unique()
                ->count(),
            'store_managers' => $formatPeople($managers->filter($isStoreManager)),
            'chief_operations' => $formatPeople($managers->filter($isChiefOperation)),
            'supervisors' => (clone $operationalUsers)
                ->whereRaw('LOWER(TRIM(user_locations.job_level)) = ?', ['supervisor'])
                ->distinct()
                ->count('users.username'),
            'non_staff' => (clone $operationalUsers)
                ->whereRaw('LOWER(TRIM(user_locations.job_level)) = ?', ['sc'])
                ->distinct()
                ->count('users.username'),
        ];
    }

    private function dailyGroups(array $filters, array $locationIds): Collection
    {
        return $this->dailyBase($filters, $locationIds)
            ->selectRaw("locations.initial as location_id, locations.name as branch, COALESCE(lines.leader_id, '') as leader_id, COALESCE(leaders.name, 'Tanpa Atasan') as leader_name")
            ->selectRaw('COUNT(DISTINCT scores.user_id) as subordinate_count')
            ->selectRaw('COALESCE(SUM(scores.approved_tasks), 0) as approved_tasks')
            ->selectRaw('COALESCE(SUM(scores.unapproved_tasks), 0) as unapproved_tasks')
            ->selectRaw('ROUND(AVG(scores.score), 2) as percentage')
            ->groupBy('locations.initial', 'locations.name', 'lines.leader_id', 'leaders.name')
            ->orderBy('locations.name')
            ->orderByRaw("COALESCE(leaders.name, 'Tanpa Atasan')")
            ->get()
            ->map(fn($row) => [
                'key' => $row->location_id . '|' . ($row->leader_id ?: 'unassigned'),
                'location_id' => $row->location_id,
                'branch' => $row->branch,
                'leader_id' => $row->leader_id ?: null,
                'leader_name' => $row->leader_name,
                'subordinate_count' => (int) $row->subordinate_count,
                'approved_tasks' => (int) $row->approved_tasks,
                'unapproved_tasks' => (int) $row->unapproved_tasks,
                'percentage' => $row->percentage === null ? null : (float) $row->percentage,
            ]);
    }

    private function monthlyGroups(array $filters, array $locationIds): Collection
    {
        [$taskExpression, $attendanceExpression, $evaluationExpression] = $this->monthlyJsonExpressions();

        return $this->monthlyBase($filters, $locationIds)
            ->selectRaw("locations.initial as location_id, locations.name as branch, COALESCE(lines.leader_id, '') as leader_id, COALESCE(leaders.name, 'Tanpa Atasan') as leader_name")
            ->selectRaw('COUNT(DISTINCT scores.user_id) as subordinate_count')
            ->selectRaw("ROUND(AVG({$taskExpression}), 2) as task_score")
            ->selectRaw("ROUND(AVG({$attendanceExpression}), 2) as attendance_score")
            ->selectRaw("ROUND(AVG({$evaluationExpression}), 2) as evaluation_score")
            ->selectRaw('ROUND(AVG(scores.final_score), 2) as percentage')
            ->groupBy('locations.initial', 'locations.name', 'lines.leader_id', 'leaders.name')
            ->orderBy('locations.name')
            ->orderByRaw("COALESCE(leaders.name, 'Tanpa Atasan')")
            ->get()
            ->map(fn($row) => [
                'key' => $row->location_id . '|' . ($row->leader_id ?: 'unassigned'),
                'location_id' => $row->location_id,
                'branch' => $row->branch,
                'leader_id' => $row->leader_id ?: null,
                'leader_name' => $row->leader_name,
                'subordinate_count' => (int) $row->subordinate_count,
                'task_score' => $row->task_score === null ? null : (float) $row->task_score,
                'attendance_score' => $row->attendance_score === null ? null : (float) $row->attendance_score,
                'evaluation_score' => $row->evaluation_score === null ? null : (float) $row->evaluation_score,
                'percentage' => $row->percentage === null ? null : (float) $row->percentage,
            ]);
    }

    private function dailyDetails(array $filters, ?string $leaderId, string $locationId): Collection
    {
        return $this->dailyRows($filters, [$locationId], $leaderId, true);
    }

    private function dailyRows(array $filters, array $locationIds, ?string $leaderId = null, bool $filterLeader = false): Collection
    {
        $query = $this->dailyBase($filters, $locationIds);
        if ($filterLeader) {
            $this->applyLeaderFilter($query, $leaderId);
        }

        return $query
            ->select([
                'scores.score_date as date',
                'locations.initial as location_id',
                'locations.name as branch',
                'subordinates.username as subordinate_id',
                'subordinates.name as subordinate_name',
                'lines.leader_id',
                'leaders.name as leader_name',
                'scores.approved_tasks',
                'scores.unapproved_tasks',
                'scores.score as percentage',
            ])
            ->orderBy('scores.score_date')
            ->orderBy('subordinates.name')
            ->get()
            ->map(fn($row) => [
                'date' => Carbon::parse($row->date)->toDateString(),
                'location_id' => $row->location_id,
                'branch' => $row->branch,
                'subordinate_id' => $row->subordinate_id,
                'subordinate_name' => $row->subordinate_name,
                'leader_id' => $row->leader_id,
                'leader_name' => $row->leader_name ?: 'Tanpa Atasan',
                'approved_tasks' => (int) $row->approved_tasks,
                'unapproved_tasks' => (int) $row->unapproved_tasks,
                'percentage' => $row->percentage === null ? null : (float) $row->percentage,
            ]);
    }

    private function monthlyDetails(array $filters, ?string $leaderId, string $locationId): Collection
    {
        return $this->monthlyRows($filters, [$locationId], $leaderId, true);
    }

    private function monthlyRows(array $filters, array $locationIds, ?string $leaderId = null, bool $filterLeader = false): Collection
    {
        $query = $this->monthlyBase($filters, $locationIds);
        if ($filterLeader) {
            $this->applyLeaderFilter($query, $leaderId);
        }

        return $query
            ->select([
                'scores.period',
                'scores.final_score',
                'scores.details',
                'locations.initial as location_id',
                'locations.name as branch',
                'subordinates.username as subordinate_id',
                'subordinates.name as subordinate_name',
                'lines.leader_id',
                'leaders.name as leader_name',
            ])
            ->orderBy('scores.period')
            ->orderBy('subordinates.name')
            ->get()
            ->map(function ($row) {
                $details = is_array($row->details)
                    ? $row->details
                    : (json_decode((string) $row->details, true) ?: []);

                return [
                    'date' => Carbon::parse($row->period)->format('Y-m'),
                    'location_id' => $row->location_id,
                    'branch' => $row->branch,
                    'subordinate_id' => $row->subordinate_id,
                    'subordinate_name' => $row->subordinate_name,
                    'leader_id' => $row->leader_id,
                    'leader_name' => $row->leader_name ?: 'Tanpa Atasan',
                    'task_score' => $this->numericOrNull($details['task_score'] ?? null),
                    'attendance_score' => $this->numericOrNull($details['attendance_score'] ?? null),
                    'evaluation_score' => $this->numericOrNull($details['personality_score'] ?? null),
                    'percentage' => (float) $row->final_score,
                ];
            });
    }

    private function dailyBase(array $filters, array $locationIds)
    {
        return DB::table('daily_scores as scores')
            ->join('users as subordinates', 'subordinates.username', '=', 'scores.user_id')
            ->join('locations', 'locations.initial', '=', 'subordinates.initial_store')
            ->leftJoin('reporting_lines as lines', function ($join) {
                $join->on('lines.subordinate_id', '=', 'subordinates.username')
                    ->where('lines.status', '=', 'active')
                    ->where('lines.relation_type', '=', 'permanent');
            })
            ->leftJoin('users as leaders', 'leaders.username', '=', 'lines.leader_id')
            ->where('scores.category', 'service_crew')
            ->whereBetween('scores.score_date', [$filters['start'], $filters['end']])
            ->whereIn('locations.initial', $locationIds);
    }

    private function monthlyBase(array $filters, array $locationIds)
    {
        return DB::table('monthly_overall_scores as scores')
            ->join('users as subordinates', 'subordinates.username', '=', 'scores.user_id')
            ->join('locations', 'locations.initial', '=', 'subordinates.initial_store')
            ->join('user_locations as crew_roles', function ($join) {
                $join->on('crew_roles.user_id', '=', 'subordinates.username')
                    ->on('crew_roles.location_id', '=', 'subordinates.initial_store')
                    ->whereRaw('LOWER(TRIM(crew_roles.job_level)) = ?', ['sc']);
            })
            ->leftJoin('reporting_lines as lines', function ($join) {
                $join->on('lines.subordinate_id', '=', 'subordinates.username')
                    ->where('lines.status', '=', 'active')
                    ->where('lines.relation_type', '=', 'permanent');
            })
            ->leftJoin('users as leaders', 'leaders.username', '=', 'lines.leader_id')
            ->whereBetween('scores.period', [
                Carbon::createFromFormat('Y-m', $filters['start'])->startOfMonth()->toDateString(),
                Carbon::createFromFormat('Y-m', $filters['end'])->startOfMonth()->toDateString(),
            ])
            ->whereIn('locations.initial', $locationIds);
    }

    private function applyLeaderFilter($query, ?string $leaderId): void
    {
        if ($leaderId) {
            $query->where('lines.leader_id', $leaderId);
            return;
        }

        $query->whereNull('lines.leader_id');
    }

    private function monthlyJsonExpressions(): array
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            return [
                "CAST(scores.details->>'task_score' AS DECIMAL)",
                "CAST(scores.details->>'attendance_score' AS DECIMAL)",
                "CAST(scores.details->>'personality_score' AS DECIMAL)",
            ];
        }

        return [
            "CAST(json_extract(scores.details, '$.task_score') AS DECIMAL)",
            "CAST(json_extract(scores.details, '$.attendance_score') AS DECIMAL)",
            "CAST(json_extract(scores.details, '$.personality_score') AS DECIMAL)",
        ];
    }

    private function numericOrNull(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }
}
