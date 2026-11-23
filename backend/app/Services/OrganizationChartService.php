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

    public function chart(User $actor, ?string $locationId, ?string $supervisorId = null, bool $requireSupervisor = false): array
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
            ->with(['leader.jobLevel', 'subordinate.jobLevel', 'backupRequest'])
            ->whereIn('leader_id', $userIds)
            ->whereIn('subordinate_id', $userIds)
            ->orderBy('leader_id')
            ->orderBy('subordinate_id')
            ->get();

        $this->markBackupEligibility($lines);
        $visibleLines = $lines->filter(fn(ReportingLine $line) => $line->relation_type === 'permanent'
            || $this->isVisibleBackup($line));
        $memberIds = $visibleLines
            ->flatMap(fn(ReportingLine $line) => [$line->leader_id, $line->subordinate_id])
            ->merge($users->filter(fn(User $user) => $this->tier($user) === self::STORE_MANAGER)->pluck('username'))
            ->unique();
        $descendants = $this->descendantIds($actor, $lines);

        $nodeUsers = $users->filter(fn(User $user) => $memberIds->contains($user->username));
        $parentNodes = $nodeUsers->filter(fn(User $user) => $this->tier($user) !== self::SERVICE_CREW)
            ->map(fn(User $user) => $this->formatNode($actor, $user, $location->initial, $lines, $descendants))
            ->values();
        $supervisors = $users->filter(fn(User $user) => $this->tier($user) === self::SUPERVISOR)
            ->map(fn(User $user) => $this->formatCandidate($user))->values();
        $storedLayout = OrganizationChartLayout::where('location_id', $location->initial)->value('layout') ?? [];
        $layout = ['nodes' => $storedLayout['nodes'] ?? [], 'edges' => $storedLayout['edges'] ?? []];
        if (isset($storedLayout['canvas'])) {
            $layout['canvas'] = $storedLayout['canvas'];
        }
        if ($supervisorId !== null) {
            $focusedIds = $this->supervisorMemberIds($users, $visibleLines, $supervisorId);
            $nodeUsers = $users->filter(fn(User $user) => $focusedIds->contains($user->username));
            $visibleLines = $visibleLines->filter(fn(ReportingLine $line) => $focusedIds->contains($line->leader_id)
                && $focusedIds->contains($line->subordinate_id));
            $layout = $storedLayout['views'][$supervisorId] ?? ['nodes' => [], 'edges' => []];
        } elseif ($requireSupervisor) {
            $nodeUsers = collect();
            $visibleLines = collect();
            $layout = ['nodes' => [], 'edges' => []];
        }

        $nodes = $nodeUsers->map(fn(User $user) => $this->formatNode($actor, $user, $location->initial, $lines, $descendants))
            ->sortBy(fn(array $node) => array_search($node['tier'], array_keys(self::TIER_LABELS), true) . '|' . $node['name'])
            ->values();

        $candidates = $users
            ->reject(fn(User $user) => $memberIds->contains($user->username) || $user->username === $supervisorId || $this->tier($user) === self::STORE_MANAGER)
            ->filter(fn(User $user) => $this->canManageUser($actor, $user, $location->initial, $descendants, true))
            ->map(fn(User $user) => $this->formatCandidate($user))
            ->sortBy('name')
            ->values();

        return [
            'location' => $this->formatLocation($location),
            'locations' => $locations->map(fn(Location $item) => $this->formatLocation($item))->values(),
            'nodes' => $nodes,
            'parent_nodes' => $parentNodes,
            'supervisors' => $supervisors,
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
            'layout' => $layout,
            'actor' => [
                'username' => $actor->username,
                'tier' => $actor->role_type === 'superadmin' ? 'superadmin' : $this->tier($actor),
                'is_admin' => $actor->role_type === 'superadmin',
            ],
        ];
    }

    private function supervisorMemberIds(Collection $users, Collection $lines, string $supervisorId): Collection
    {
        $byId = $users->keyBy('username');
        $supervisor = $byId->get($supervisorId);
        if (!$supervisor || $this->tier($supervisor) !== self::SUPERVISOR) {
            throw ValidationException::withMessages(['supervisor_id' => ['Pilih supervisor dari cabang yang sedang dibuka.']]);
        }

        $members = collect([$supervisorId]);
        $lines->where('leader_id', $supervisorId)->each(function (ReportingLine $line) use ($byId, $members) {
            $crew = $byId->get($line->subordinate_id);
            if ($crew && $this->tier($crew) === self::SERVICE_CREW) {
                $members->push($crew->username);
            }
        });

        // Trace upwards only from this supervisor, not from shared crew.
        $queue = collect([$supervisorId]);
        while ($queue->isNotEmpty()) {
            $childId = $queue->shift();
            foreach ($lines->where('subordinate_id', $childId) as $line) {
                $leader = $byId->get($line->leader_id);
                $child = $byId->get($childId);
                if ($leader && $child && $this->isValidTierPair($this->tier($leader), $this->tier($child))
                    && !$members->contains($leader->username)) {
                    $members->push($leader->username);
                    $queue->push($leader->username);
                }
            }
        }

        return $members->unique()->values();
    }

    public function saveLayout(User $actor, string $locationId, array $nodes, array $edges, ?string $supervisorId = null, ?array $canvas = null): array
    {
        $this->assertLocationAccess($actor, $locationId);
        $users = $this->usersAtLocation($locationId)->keyBy('username');
        $lines = $this->linesForUsers($users->keys())->keyBy(fn(ReportingLine $line) => (string) $line->id);
        if ($supervisorId !== null) {
            $visibleLines = $lines->filter(fn(ReportingLine $line) => $line->relation_type === 'permanent' || $this->isVisibleBackup($line));
            $focusedIds = $this->supervisorMemberIds($users, $visibleLines, $supervisorId);
            $users = $users->filter(fn(User $user) => $focusedIds->contains($user->username));
            $lines = $visibleLines->filter(fn(ReportingLine $line) => $focusedIds->contains($line->leader_id)
                && $focusedIds->contains($line->subordinate_id));
        }

        $cleanNodes = [];
        foreach ($nodes as $username => $position) {
            $groupLeader = (str_starts_with((string) $username, '__group__:') || str_starts_with((string) $username, '__space__:')) ? substr((string) $username, 10) : null;
            $validGroup = $groupLeader && $users->has($groupLeader) && $this->tier($users->get($groupLeader)) === self::SUPERVISOR;
            if ((!$users->has((string) $username) && !$validGroup) || !is_array($position)) {
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
            if ((!$lines->has($lineKey) && !($lineKey[0] === '-' && $lines->has(substr($lineKey, 1)))) || !is_array($route)) {
                continue;
            }
            $points = collect($route['points'] ?? [])
                ->filter(fn($point) => is_array($point))
                ->take(1000)
                ->map(fn(array $point) => [
                    'x' => $this->normalizedCoordinate($point['x'] ?? 0.5),
                    'y' => $this->normalizedCoordinate($point['y'] ?? 0.5),
                ])
                ->values()
                ->all();
            $cleanEdges[$lineKey] = ['points' => $points];
            foreach (['start_anchor', 'end_anchor'] as $anchorKey) {
                $anchor = $route[$anchorKey] ?? null;
                if (is_array($anchor) && in_array($anchor['side'] ?? null, ['top', 'right', 'bottom', 'left'], true)
                    && isset($anchor['position']) && is_numeric($anchor['position'])) {
                    $cleanEdges[$lineKey][$anchorKey] = [
                        'side' => $anchor['side'],
                        'position' => $this->normalizedCoordinate($anchor['position']),
                    ];
                }
            }
        }

        $layout = ['nodes' => $cleanNodes, 'edges' => $cleanEdges];
        if ($canvas !== null) {
            $layout['canvas'] = ['width' => (int) $canvas['width'], 'height' => (int) $canvas['height']];
        }
        DB::transaction(function () use ($actor, $locationId, $supervisorId, $layout) {
            $record = OrganizationChartLayout::firstOrCreate(
                ['location_id' => $locationId],
                ['layout' => ['nodes' => [], 'edges' => []], 'updated_by' => $actor->username]
            );
            $record = OrganizationChartLayout::whereKey($record->id)->lockForUpdate()->firstOrFail();
            $stored = $record->layout;
            if ($supervisorId !== null) {
                $stored['views'][$supervisorId] = $layout;
            } else {
                $stored = array_replace($stored, $layout);
            }
            $record->update(['layout' => $stored, 'updated_by' => $actor->username]);
        });

        return $layout;
    }

    public function createRelation(User $actor, string $locationId, string $leaderId, string $subordinateId): ReportingLine
    {
        [$leader, $subordinate, $lines, $descendants] = $this->mutationContext($actor, $locationId, $leaderId, $subordinateId);
        $this->validatePair($leader, $subordinate);
        $this->assertCanManageRelation($actor, $leader, $subordinate, $locationId, $lines, $descendants, true);

        return DB::transaction(function () use ($leaderId, $subordinateId) {
            $this->upsertPermanentRelation($leaderId, $subordinateId);
            app(BackupMirrorService::class)->syncForCrew([$subordinateId]);
            return ReportingLine::withoutGlobalScope('effective_backup_period')
                ->where('leader_id', $leaderId)->where('subordinate_id', $subordinateId)->firstOrFail();
        });
    }

    public function updateRelationStatus(User $actor, ReportingLine $line, string $locationId, string $status): ReportingLine
    {
        if ($line->relation_type === 'backup') {
            abort_unless($this->isVisibleBackup($line), 422, 'Periode backup tidak berlaku.');
            $line = ReportingLine::withoutGlobalScope('effective_backup_period')->where('leader_id', $line->backupRequest->requester_id)->where('subordinate_id', $line->subordinate_id)->where('relation_type', 'permanent')->firstOrFail();
        }
        $this->assertPermanent($line);
        [$leader, $subordinate, $lines, $descendants] = $this->mutationContext(
            $actor,
            $locationId,
            $line->leader_id,
            $line->subordinate_id
        );
        $this->validatePair($leader, $subordinate);
        $this->assertCanManageRelation($actor, $leader, $subordinate, $locationId, $lines, $descendants);

        DB::transaction(fn() => $line->update(['status' => $status]));

        return $line->fresh(['leader.jobLevel', 'subordinate.jobLevel']);
    }

    public function placeCrew(User $actor, string $locationId, string $username, array $transitions): void
    {
        $this->assertLocationAccess($actor, $locationId);
        $users = $this->usersAtLocation($locationId)->keyBy('username');
        $crew = $users->get($username);
        abort_unless($crew && $this->tier($crew) === self::SERVICE_CREW, 422, 'Hanya card Service Crew yang dapat dimasukkan ke kelompok.');
        foreach ($transitions as $transition) {
            $leader = $users->get($transition['leader_id']);
            abort_unless($leader && $this->tier($leader) === self::SUPERVISOR, 422, 'Kelompok harus dimiliki supervisor pada cabang ini.');
            $line = ReportingLine::withoutGlobalScope('effective_backup_period')
                ->where('leader_id', $leader->username)->where('subordinate_id', $username)->lockForUpdate()->first();
            if ($line) $this->updateRelationStatus($actor, $line, $locationId, $transition['status']);
            elseif ($transition['status'] === 'active') $this->createRelation($actor, $locationId, $leader->username, $username);
        }
    }

    public function updateGroupStatus(User $actor, string $locationId, string $supervisorId, string $status): void
    {
        $this->assertLocationAccess($actor, $locationId);
        $users = $this->usersAtLocation($locationId)->keyBy('username');
        $supervisor = $users->get($supervisorId);
        abort_if(!$supervisor || $this->tier($supervisor) !== self::SUPERVISOR, 422, 'Supervisor tidak tersedia pada cabang ini.');
        $crewIds = $users->filter(fn(User $user) => $this->tier($user) === self::SERVICE_CREW)->keys();
        DB::transaction(function () use ($actor, $locationId, $supervisorId, $status, $crewIds) {
            $lines = ReportingLine::withoutGlobalScope('effective_backup_period')->where('leader_id', $supervisorId)
                ->whereIn('subordinate_id', $crewIds)->lockForUpdate()->get()->filter(fn(ReportingLine $line) => $line->relation_type === 'permanent' || $this->isVisibleBackup($line));
            foreach ($lines as $line) $this->updateRelationStatus($actor, $line, $locationId, $status);
        });
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
        DB::transaction(fn() => $line->delete());
    }

    public function saveNode(
        User $actor,
        string $locationId,
        string $username,
        int $jobLevelId,
        array $leaderIds,
        string $initialStatus = 'active'
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

        DB::transaction(function () use ($user, $jobLevel, $futureTier, $locationId, $leaders, $lines, $initialStatus) {
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
                $this->upsertPermanentRelation($leaderId, $user->username, $initialStatus);
            }
            app(BackupMirrorService::class)->syncForCrew([$user->username]);
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
            && $line->leader_id === $username
            && $this->isCurrentlyEffective($line));
        if ($activeBackup) {
            throw ValidationException::withMessages([
                'card' => ['Card masih terlibat dalam relasi backup yang sedang berlaku.'],
            ]);
        }

        $partnerIds = $users->keys();
        DB::transaction(function () use ($username, $partnerIds) {
            ReportingLine::withoutGlobalScope('effective_backup_period')
                ->where('relation_type', 'permanent')
                ->where(function ($query) use ($username, $partnerIds) {
                    $query->where(function ($incoming) use ($username, $partnerIds) {
                        $incoming->where('subordinate_id', $username)->whereIn('leader_id', $partnerIds);
                    })->orWhere(function ($outgoing) use ($username, $partnerIds) {
                        $outgoing->where('leader_id', $username)->whereIn('subordinate_id', $partnerIds);
                    });
                })
                ->get()->each(fn(ReportingLine $line) => $line->delete());
        });
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
        $lines = ReportingLine::withoutGlobalScope('effective_backup_period')->with('backupRequest')
            ->whereIn('leader_id', $userIds)->whereIn('subordinate_id', $userIds)->get();
        $this->markBackupEligibility($lines);
        return $lines;
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
            && $line->leader_id === $user->username
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
        $canManage = ($line->relation_type === 'permanent' || $this->isVisibleBackup($line))
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
            'is_mirror_member' => $this->isVisibleBackup($line),
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

    private function upsertPermanentRelation(string $leaderId, string $subordinateId, string $status = 'active'): void
    {
        $existing = ReportingLine::withoutGlobalScope('effective_backup_period')->where('leader_id', $leaderId)->where('subordinate_id', $subordinateId)->first();
        if ($existing && $existing->relation_type === 'backup' && $this->isCurrentlyEffective($existing)) {
            throw ValidationException::withMessages(['relation' => ['Relasi backup aktif tidak dapat diganti menjadi permanen.']]);
        }
        $now = now();
        DB::table('reporting_lines')->upsert([[
            'leader_id' => $leaderId,
            'subordinate_id' => $subordinateId,
            'relation_type' => 'permanent',
            'status' => $status,
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
            throw ValidationException::withMessages(['relation' => ['Relasi backup mengikuti relasi permanen SPV asal dan tidak dapat dihapus langsung.']]);
        }
    }

    private function markBackupEligibility(Collection $lines): void
    {
        $ids = $lines->where('relation_type', 'backup')->pluck('id');
        if ($ids->isEmpty()) return;
        $effective = ReportingLine::query()->whereIn('id', $ids)->pluck('id');
        $backups = $lines->where('relation_type', 'backup');
        $sources = DB::table('reporting_lines')->where('relation_type', 'permanent')
            ->whereIn('leader_id', $backups->map(fn($line) => $line->backupRequest?->requester_id)->filter())
            ->whereIn('subordinate_id', $backups->pluck('subordinate_id'))->get()->keyBy(fn($line) => $line->leader_id . '|' . $line->subordinate_id);
        foreach ($backups as $line) {
            $request = $line->backupRequest;
            $line->setRelation('effectiveBackup', $effective->contains($line->id));
            $line->setRelation('mirrorMember', $request && $request->status === 'approved'
                && $request->start_date->lte(today()) && $request->end_date->gte(today())
                && $sources->has($request->requester_id . '|' . $line->subordinate_id));
        }
    }

    private function isVisibleBackup(ReportingLine $line): bool
    {
        if ($line->relation_type !== 'backup') return false;
        if ($line->relationLoaded('mirrorMember')) return $line->getRelation('mirrorMember');
        $request = $line->backupRequest;
        return $request && $request->status === 'approved'
            && $request->start_date->lte(today()) && $request->end_date->gte(today())
            && DB::table('reporting_lines')->where('leader_id', $request->requester_id)
                ->where('subordinate_id', $line->subordinate_id)->where('relation_type', 'permanent')->exists();
    }

    private function isCurrentlyEffective(ReportingLine $line): bool
    {
        $today = Carbon::today();
        return $line->status === 'active'
            && ($line->relation_type === 'permanent'
                || ($line->effective_from?->lte($today) && $line->effective_until?->gte($today)
                    && ($line->relationLoaded('effectiveBackup') ? $line->getRelation('effectiveBackup') : ReportingLine::query()->whereKey($line->id)->exists())));
    }
}
