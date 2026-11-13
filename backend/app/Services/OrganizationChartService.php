<?php

namespace App\Services;

use App\Models\JobLevel;
use App\Models\Location;
use App\Models\OrganizationChartLayout;
use App\Models\ReportingLine;
use App\Models\User;
use App\Models\UserLocation;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrganizationChartService
{
    public const STORE_MANAGER = 'store_manager';
    public const CHIEF_OPERATION = 'chief_operation';
    public const SUPERVISOR = 'supervisor';
    public const SERVICE_CREW = 'service_crew';

    private const TIER_LABELS = [
        self::STORE_MANAGER => 'Store Manager',
        self::CHIEF_OPERATION => 'Chief Operation',
        self::SUPERVISOR => 'Supervisor',
        self::SERVICE_CREW => 'Service Crew',
    ];

    public function __construct(private ManagerScopeService $managerScope)
    {
    }

    public function chart(User $actor, ?string $locationId): array
    {
        $locations = $this->accessibleLocations($actor);
        abort_if($locations->isEmpty(), 403, 'Tidak memiliki akses cabang.');

        $location = $locationId
            ? $locations->firstWhere('initial', $locationId)
            : $locations->first();
        abort_if(!$location, 403, 'Tidak memiliki akses ke cabang tersebut.');

        $users = $this->usersAtLocation($location->initial);
        $userIds = $users->pluck('username');
        $lines = ReportingLine::withoutGlobalScope('effective_backup_period')
            ->with(['leader.jobLevel', 'subordinate.jobLevel'])
            ->whereIn('leader_id', $userIds)
            ->whereIn('subordinate_id', $userIds)
            ->orderBy('leader_id')
            ->orderBy('subordinate_id')
            ->get();

        $visibleLines = $lines->filter(fn(ReportingLine $line) => $line->relation_type === 'permanent'
            || $this->isCurrentlyEffective($line));
        $memberIds = $visibleLines
            ->flatMap(fn(ReportingLine $line) => [$line->leader_id, $line->subordinate_id])
            ->merge($users->filter(fn(User $user) => $this->tier($user) === self::STORE_MANAGER)->pluck('username'))
            ->unique();
        $descendants = $this->descendantIds($actor, $lines);

        $nodes = $users
            ->filter(fn(User $user) => $memberIds->contains($user->username))
            ->map(fn(User $user) => $this->formatNode($actor, $user, $location->initial, $lines, $descendants))
            ->sortBy(fn(array $node) => array_search($node['tier'], array_keys(self::TIER_LABELS), true) . '|' . $node['name'])
            ->values();

        $candidates = $users
            ->reject(fn(User $user) => $memberIds->contains($user->username) || $this->tier($user) === self::STORE_MANAGER)
            ->filter(fn(User $user) => $this->canManageUser($actor, $user, $location->initial, $descendants, true))
            ->map(fn(User $user) => $this->formatCandidate($user))
            ->sortBy('name')
            ->values();

        return [
            'location' => $this->formatLocation($location),
            'locations' => $locations->map(fn(Location $item) => $this->formatLocation($item))->values(),
            'nodes' => $nodes,
            'edges' => $visibleLines->map(fn(ReportingLine $line) => $this->formatEdge($actor, $line, $location->initial, $descendants))->values(),
            'candidates' => $candidates,
            'job_levels' => JobLevel::query()
                ->where('visible_in_yodaily', true)
                ->orderBy('name')
                ->get(['id', 'position_code', 'name', 'grade'])
                ->map(fn(JobLevel $jobLevel) => [
                    'id' => $jobLevel->id,
                    'name' => $jobLevel->name,
                    'position_code' => $jobLevel->position_code,
                    'tier' => $this->identifiedTierForJobLevel($jobLevel),
                ])
                ->values(),
            'layout' => OrganizationChartLayout::where('location_id', $location->initial)->value('layout')
                ?? ['nodes' => [], 'edges' => []],
            'actor' => [
                'username' => $actor->username,
                'tier' => $actor->role_type === 'superadmin' ? 'superadmin' : $this->tier($actor),
                'is_admin' => $actor->role_type === 'superadmin',
            ],
        ];
    }

    public function saveLayout(User $actor, string $locationId, array $nodes, array $edges): array
    {
        $this->assertLocationAccess($actor, $locationId);
        $users = $this->usersAtLocation($locationId)->keyBy('username');
        $lines = $this->linesForUsers($users->keys())->keyBy(fn(ReportingLine $line) => (string) $line->id);

        $cleanNodes = [];
        foreach ($nodes as $username => $position) {
            if (!$users->has((string) $username) || !is_array($position)) {
                continue;
            }
            $cleanNodes[(string) $username] = [
                'x' => $this->normalizedCoordinate($position['x'] ?? 0.5),
                'y' => $this->normalizedCoordinate($position['y'] ?? 0.5),
            ];
        }

        $cleanEdges = [];
        foreach ($edges as $lineId => $route) {
            $lineKey = (string) $lineId;
            if (!$lines->has($lineKey) || !is_array($route)) {
                continue;
            }
            $points = collect($route['points'] ?? [])
                ->filter(fn($point) => is_array($point))
                ->take(12)
                ->map(fn(array $point) => [
                    'x' => $this->normalizedCoordinate($point['x'] ?? 0.5),
                    'y' => $this->normalizedCoordinate($point['y'] ?? 0.5),
                ])
                ->values()
                ->all();
            $cleanEdges[$lineKey] = ['points' => $points];
        }

        $layout = ['nodes' => $cleanNodes, 'edges' => $cleanEdges];
        OrganizationChartLayout::updateOrCreate(
            ['location_id' => $locationId],
            ['layout' => $layout, 'updated_by' => $actor->username]
        );

        return $layout;
    }

    public function createRelation(User $actor, string $locationId, string $leaderId, string $subordinateId): ReportingLine
    {
        [$leader, $subordinate, $lines, $descendants] = $this->mutationContext($actor, $locationId, $leaderId, $subordinateId);
        $this->validatePair($leader, $subordinate);
        $this->assertCanManageRelation($actor, $leader, $subordinate, $locationId, $lines, $descendants, true);

        $now = now();
        DB::table('reporting_lines')->upsert([[
            'leader_id' => $leaderId,
            'subordinate_id' => $subordinateId,
            'relation_type' => 'permanent',
            'status' => 'active',
            'backup_request_id' => null,
            'effective_from' => null,
            'effective_until' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ]], ['leader_id', 'subordinate_id'], [
            'relation_type', 'status', 'backup_request_id', 'effective_from', 'effective_until', 'updated_at',
        ]);

        return ReportingLine::withoutGlobalScope('effective_backup_period')
            ->where('leader_id', $leaderId)
            ->where('subordinate_id', $subordinateId)
            ->firstOrFail();
    }

    public function updateRelationStatus(User $actor, ReportingLine $line, string $locationId, string $status): ReportingLine
    {
        $this->assertPermanent($line);
        [$leader, $subordinate, $lines, $descendants] = $this->mutationContext(
            $actor,
            $locationId,
            $line->leader_id,
            $line->subordinate_id
        );
        $this->validatePair($leader, $subordinate);
        $this->assertCanManageRelation($actor, $leader, $subordinate, $locationId, $lines, $descendants);

        $line->update(['status' => $status]);

        return $line->fresh(['leader.jobLevel', 'subordinate.jobLevel']);
    }

    public function deleteRelation(User $actor, ReportingLine $line, string $locationId): void
    {
        $this->assertPermanent($line);
        [$leader, $subordinate, $lines, $descendants] = $this->mutationContext(
            $actor,
            $locationId,
            $line->leader_id,
            $line->subordinate_id
        );
        $this->assertCanManageRelation($actor, $leader, $subordinate, $locationId, $lines, $descendants);
        $line->delete();
    }

    public function saveNode(
        User $actor,
        string $locationId,
        string $username,
        int $jobLevelId,
        array $leaderIds
    ): void {
        $this->assertLocationAccess($actor, $locationId);
        $users = $this->usersAtLocation($locationId)->keyBy('username');
        /** @var User|null $user */
        $user = $users->get($username);
        abort_if(!$user, 404, 'User tidak ditemukan pada cabang ini.');

        $jobLevel = JobLevel::where('visible_in_yodaily', true)->find($jobLevelId);
        if (!$jobLevel) {
            throw ValidationException::withMessages([
                'job_level_id' => ['Pilih jabatan yang masih aktif dan tersedia.'],
            ]);
        }
        $currentTier = $this->tier($user);
        $futureTier = $this->identifiedTierForJobLevel($jobLevel) ?? $currentTier;
        if ($currentTier === self::STORE_MANAGER || $futureTier === self::STORE_MANAGER) {
            throw ValidationException::withMessages([
                'jabatan' => ['Card Store Manager hanya dapat diubah melalui Master User.'],
            ]);
        }

        $lines = $this->linesForUsers($users->keys());
        $descendants = $this->descendantIds($actor, $lines);
        $leaders = collect($leaderIds)->unique()->map(function (string $leaderId) use ($users) {
            $leader = $users->get($leaderId);
            abort_if(!$leader, 422, 'Atasan harus berasal dari cabang yang sama.');
            return $leader;
        });

        if ($leaders->isEmpty()) {
            throw ValidationException::withMessages(['leader_ids' => ['Pilih minimal satu atasan.']]);
        }

        foreach ($leaders as $leader) {
            $this->validateTierPair($this->tier($leader), $futureTier);
            $this->assertCanManageRelation($actor, $leader, $user, $locationId, $lines, $descendants, true);
        }

        $activeChildren = $lines->where('relation_type', 'permanent')
            ->where('status', 'active')
            ->where('leader_id', $username);
        foreach ($activeChildren as $childLine) {
            $child = $users->get($childLine->subordinate_id);
            if ($child && !$this->isValidTierPair($futureTier, $this->tier($child))) {
                throw ValidationException::withMessages([
                    'jabatan' => ["Pindahkan bawahan aktif {$child->name} sebelum mengubah jabatan card ini."],
                ]);
            }
        }

        DB::transaction(function () use ($user, $jobLevel, $futureTier, $locationId, $leaders, $lines) {
            $user->update(['job_level_id' => $jobLevel->id]);
            UserLocation::updateOrCreate(
                ['user_id' => $user->username, 'location_id' => $locationId],
                ['job_level' => $this->appRoleForTier($futureTier)]
            );

            $selectedLeaderIds = $leaders->pluck('username');
            $incoming = $lines->where('relation_type', 'permanent')->where('subordinate_id', $user->username);
            ReportingLine::withoutGlobalScope('effective_backup_period')
                ->whereIn('id', $incoming->whereNotIn('leader_id', $selectedLeaderIds)->pluck('id'))
                ->update(['status' => 'inactive', 'updated_at' => now()]);

            foreach ($selectedLeaderIds as $leaderId) {
                $this->upsertPermanentRelation($leaderId, $user->username);
            }
        });
    }

    public function deleteNode(User $actor, string $locationId, string $username): void
    {
        $this->assertLocationAccess($actor, $locationId);
        $users = $this->usersAtLocation($locationId)->keyBy('username');
        /** @var User|null $user */
        $user = $users->get($username);
        abort_if(!$user, 404, 'User tidak ditemukan pada cabang ini.');
        if ($this->tier($user) === self::STORE_MANAGER) {
            throw ValidationException::withMessages(['card' => ['Card Store Manager tidak dapat dihapus dari organigram.']]);
        }

        $lines = $this->linesForUsers($users->keys());
        $descendants = $this->descendantIds($actor, $lines);
        if (!$this->canManageUser($actor, $user, $locationId, $descendants)) {
            abort(403, 'Anda hanya dapat mengelola card bawahan.');
        }

        $activeChild = $lines->first(fn(ReportingLine $line) => $line->relation_type === 'permanent'
            && $line->status === 'active'
            && $line->leader_id === $username);
        if ($activeChild) {
            throw ValidationException::withMessages([
                'card' => ['Pindahkan atau putuskan seluruh bawahan aktif sebelum menghapus card ini.'],
            ]);
        }

        $activeBackup = $lines->first(fn(ReportingLine $line) => $line->relation_type === 'backup'
            && ($line->leader_id === $username || $line->subordinate_id === $username)
            && $this->isCurrentlyEffective($line));
        if ($activeBackup) {
            throw ValidationException::withMessages([
                'card' => ['Card masih terlibat dalam relasi backup yang sedang berlaku.'],
            ]);
        }

        $partnerIds = $users->keys();
        ReportingLine::withoutGlobalScope('effective_backup_period')
            ->where('relation_type', 'permanent')
            ->where(function ($query) use ($username, $partnerIds) {
                $query->where(function ($incoming) use ($username, $partnerIds) {
                    $incoming->where('subordinate_id', $username)->whereIn('leader_id', $partnerIds);
                })->orWhere(function ($outgoing) use ($username, $partnerIds) {
                    $outgoing->where('leader_id', $username)->whereIn('subordinate_id', $partnerIds);
                });
            })
            ->delete();
    }

    public function validatePair(User|string $leader, User|string $subordinate): void
    {
        $leaderUser = $leader instanceof User ? $leader : User::with(['jobLevel', 'userLocations'])->where('username', $leader)->first();
        $subordinateUser = $subordinate instanceof User ? $subordinate : User::with(['jobLevel', 'userLocations'])->where('username', $subordinate)->first();
        if (!$leaderUser || !$subordinateUser) {
            return;
        }

        $this->validateTierPair($this->tier($leaderUser), $this->tier($subordinateUser));
    }

    public function tier(User $user): string
    {
        $jobLevel = $user->relationLoaded('jobLevel') ? $user->jobLevel : $user->jobLevel()->first();
        if ($jobLevel) {
            $identified = $this->identifiedTierForJobLevel($jobLevel);
            if ($identified) {
                return $identified;
            }
        }

        return match ($user->role_type) {
            'manager' => self::STORE_MANAGER,
            'supervisor' => self::SUPERVISOR,
            default => self::SERVICE_CREW,
        };
    }

    private function identifiedTierForJobLevel(JobLevel $jobLevel): ?string
    {
        $grade = strtoupper(trim((string) $jobLevel->grade));
        $gradeTier = match ($grade) {
            'MGR' => self::STORE_MANAGER,
            'CHF' => self::CHIEF_OPERATION,
            'STF' => self::SUPERVISOR,
            'NST', 'PKL', 'THL' => self::SERVICE_CREW,
            default => null,
        };
        if ($gradeTier) {
            return $gradeTier;
        }

        $code = strtoupper(trim((string) $jobLevel->position_code));
        $name = strtoupper(trim((string) $jobLevel->name));
        if (str_starts_with($code, 'SM-') || str_starts_with($code, 'SMP-') || str_contains($name, 'STORE MANAGER')) {
            return self::STORE_MANAGER;
        }
        if (str_starts_with($code, 'CF-OPR-CAB-') || str_contains($name, 'CHIEF OPERATION')) {
            return self::CHIEF_OPERATION;
        }
        if (str_contains($name, 'SUPERVISOR')) {
            return self::SUPERVISOR;
        }

        return null;
    }

    private function validateTierPair(string $leaderTier, string $subordinateTier): void
    {
        if (!$this->isValidTierPair($leaderTier, $subordinateTier)) {
            throw ValidationException::withMessages([
                'leader_id' => ['Relasi tidak valid. Gunakan SM ke CO/SPV, CO ke SPV, atau SPV ke Service Crew.'],
            ]);
        }
    }

    private function isValidTierPair(string $leaderTier, string $subordinateTier): bool
    {
        return match ($leaderTier) {
            self::STORE_MANAGER => in_array($subordinateTier, [self::CHIEF_OPERATION, self::SUPERVISOR], true),
            self::CHIEF_OPERATION => $subordinateTier === self::SUPERVISOR,
            self::SUPERVISOR => $subordinateTier === self::SERVICE_CREW,
            default => false,
        };
    }

    private function accessibleLocations(User $actor): Collection
    {
        if ($actor->role_type === 'superadmin') {
            abort_if(!$actor->accountRole?->hasPermission('reporting_lines'), 403, 'Tidak memiliki akses.');
            return Location::query()->orderBy('name')->get();
        }
        abort_if($actor->role_type !== 'manager', 403, 'Tidak memiliki akses.');

        return $this->managerScope->accessibleLocations($actor);
    }

    private function assertLocationAccess(User $actor, string $locationId): void
    {
        abort_if(!$this->accessibleLocations($actor)->contains('initial', $locationId), 403, 'Tidak memiliki akses ke cabang tersebut.');
    }

    private function usersAtLocation(string $locationId): Collection
    {
        return User::query()
            ->where('active', true)
            ->where(function ($query) use ($locationId) {
                $query->whereHas('userLocations', fn($assignments) => $assignments->where('location_id', $locationId))
                    ->orWhere('initial_store', $locationId);
            })
            ->with(['jobLevel:id,position_code,name,grade', 'division:id,name,group_code', 'userLocations', 'locations'])
            ->orderBy('name')
            ->get();
    }

    private function linesForUsers(Collection $userIds): Collection
    {
        return ReportingLine::withoutGlobalScope('effective_backup_period')
            ->whereIn('leader_id', $userIds)
            ->whereIn('subordinate_id', $userIds)
            ->get();
    }

    private function mutationContext(User $actor, string $locationId, string $leaderId, string $subordinateId): array
    {
        $this->assertLocationAccess($actor, $locationId);
        $users = $this->usersAtLocation($locationId)->keyBy('username');
        $leader = $users->get($leaderId);
        $subordinate = $users->get($subordinateId);
        abort_if(!$leader || !$subordinate, 422, 'Atasan dan bawahan harus berasal dari cabang yang sama.');
        $lines = $this->linesForUsers($users->keys());

        return [$leader, $subordinate, $lines, $this->descendantIds($actor, $lines)];
    }

    private function assertCanManageRelation(
        User $actor,
        User $leader,
        User $subordinate,
        string $locationId,
        Collection $lines,
        Collection $descendants,
        bool $allowCandidate = false
    ): void {
        if ($actor->role_type === 'superadmin') {
            return;
        }
        if (!$this->canManageUser($actor, $subordinate, $locationId, $descendants, $allowCandidate)) {
            abort(403, 'Anda hanya dapat mengelola relasi bawahan.');
        }

    }

    private function canManageUser(
        User $actor,
        User $target,
        string $locationId,
        Collection $descendants,
        bool $allowCandidate = false
    ): bool {
        if ($actor->role_type === 'superadmin') {
            return true;
        }
        if ($actor->username === $target->username || $this->tier($target) === self::STORE_MANAGER) {
            return false;
        }
        if (!$actor->locations->contains('initial', $locationId) && $actor->initial_store !== $locationId) {
            return false;
        }

        return true;
    }

    private function descendantIds(User $actor, Collection $lines): Collection
    {
        if ($actor->role_type === 'superadmin') {
            return collect();
        }
        $active = $lines->where('relation_type', 'permanent')->where('status', 'active');
        $seen = collect();
        $queue = collect([$actor->username]);
        while ($queue->isNotEmpty()) {
            $leaderId = $queue->shift();
            foreach ($active->where('leader_id', $leaderId)->pluck('subordinate_id') as $childId) {
                if (!$seen->contains($childId)) {
                    $seen->push($childId);
                    $queue->push($childId);
                }
            }
        }

        return $seen;
    }

    private function formatNode(
        User $actor,
        User $user,
        string $locationId,
        Collection $lines,
        Collection $descendants
    ): array {
        $tier = $this->tier($user);
        $incoming = $lines->where('relation_type', 'permanent')->where('subordinate_id', $user->username);
        $activeChildCount = $lines->filter(fn(ReportingLine $line) => $line->relation_type === 'permanent'
            && $line->status === 'active'
            && $line->leader_id === $user->username)->count();
        $activeBackup = $lines->contains(fn(ReportingLine $line) => $line->relation_type === 'backup'
            && ($line->leader_id === $user->username || $line->subordinate_id === $user->username)
            && $this->isCurrentlyEffective($line));
        $canManage = $this->canManageUser($actor, $user, $locationId, $descendants);

        return [
            ...$this->formatCandidate($user),
            'tier' => $tier,
            'tier_label' => self::TIER_LABELS[$tier],
            'leader_ids' => $incoming->where('status', 'active')->pluck('leader_id')->values(),
            'inactive_leader_ids' => $incoming->where('status', 'inactive')->pluck('leader_id')->values(),
            'can_edit' => $canManage && $tier !== self::STORE_MANAGER,
            'can_delete' => $canManage && $tier !== self::STORE_MANAGER && $activeChildCount === 0 && !$activeBackup,
            'active_children_count' => $activeChildCount,
        ];
    }

    private function formatCandidate(User $user): array
    {
        $tier = $this->tier($user);
        return [
            'username' => $user->username,
            'name' => $user->name,
            'job_level_id' => $user->job_level_id,
            'job_level_name' => $user->jobLevel?->name,
            'position_code' => $user->jobLevel?->position_code,
            'division_name' => $user->division?->name,
            'tier' => $tier,
            'tier_label' => self::TIER_LABELS[$tier],
        ];
    }

    private function formatEdge(User $actor, ReportingLine $line, string $locationId, Collection $descendants): array
    {
        $canManage = $line->relation_type === 'permanent'
            && $line->subordinate
            && $line->leader
            && $this->canManageUser($actor, $line->subordinate, $locationId, $descendants);

        return [
            'id' => $line->id,
            'leader_id' => $line->leader_id,
            'subordinate_id' => $line->subordinate_id,
            'status' => $line->status,
            'relation_type' => $line->relation_type,
            'effective_from' => $line->effective_from?->toDateString(),
            'effective_until' => $line->effective_until?->toDateString(),
            'is_currently_effective' => $this->isCurrentlyEffective($line),
            'can_manage' => $canManage,
        ];
    }

    private function formatLocation(Location $location): array
    {
        return ['initial' => $location->initial, 'name' => $location->name];
    }

    private function appRoleForTier(string $tier): string
    {
        return match ($tier) {
            self::STORE_MANAGER, self::CHIEF_OPERATION => 'manager',
            self::SUPERVISOR => 'supervisor',
            default => 'sc',
        };
    }

    private function normalizedCoordinate(mixed $value): float
    {
        return round(max(0, min(1, (float) $value)), 5);
    }

    private function upsertPermanentRelation(string $leaderId, string $subordinateId): void
    {
        $now = now();
        DB::table('reporting_lines')->upsert([[
            'leader_id' => $leaderId,
            'subordinate_id' => $subordinateId,
            'relation_type' => 'permanent',
            'status' => 'active',
            'backup_request_id' => null,
            'effective_from' => null,
            'effective_until' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ]], ['leader_id', 'subordinate_id'], [
            'relation_type', 'status', 'backup_request_id', 'effective_from', 'effective_until', 'updated_at',
        ]);
    }

    private function assertPermanent(ReportingLine $line): void
    {
        if ($line->relation_type !== 'permanent') {
            throw ValidationException::withMessages(['relation' => ['Relasi backup hanya dapat dibaca dari organigram.']]);
        }
    }

    private function isCurrentlyEffective(ReportingLine $line): bool
    {
        $today = Carbon::today();
        return $line->status === 'active'
            && ($line->relation_type === 'permanent'
                || ($line->effective_from?->lte($today) && $line->effective_until?->gte($today)));
    }
}
