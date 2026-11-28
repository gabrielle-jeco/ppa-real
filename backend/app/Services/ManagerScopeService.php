<?php

namespace App\Services;

use App\Models\Location;
use App\Models\ReportingLine;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;

class ManagerScopeService
{
    public function accessibleLocations(User $manager): Collection
    {
        abort_if($manager->role_type !== 'manager', 403, 'Tidak memiliki akses.');

        $manager->loadMissing('locations');
        $locations = $manager->locations;

        if ($manager->initial_store && !$locations->contains('initial', $manager->initial_store)) {
            $initialLocation = Location::where('initial', $manager->initial_store)->first();
            if ($initialLocation) {
                $locations = $locations->push($initialLocation);
            }
        }

        $locations = $locations->unique('initial')->sortBy('name')->values();
        if ($manager->manager_type === 'RM') {
            return $locations;
        }

        $primary = $locations->firstWhere('initial', $manager->initial_store) ?? $locations->first();

        return $primary ? collect([$primary]) : collect();
    }

    public function supervisors(User $manager, ?string $locationId = null): Collection
    {
        abort_if($manager->role_type !== 'manager', 403, 'Tidak memiliki akses.');

        if ($locationId !== null) {
            abort_if(
                !$this->accessibleLocations($manager)->contains('initial', $locationId),
                403,
                'Tidak memiliki akses ke cabang tersebut.'
            );
        }

        $direct = $this->activeSubordinates(collect([$manager->username]));
        $chiefIds = $direct
            ->filter(fn (User $user) => $user->role_type === 'manager' && $user->manager_type === 'CO')
            ->pluck('username');

        $supervisors = $direct->filter(fn (User $user) => $user->role_type === 'supervisor');
        if ($chiefIds->isNotEmpty()) {
            $supervisors = $supervisors->merge(
                $this->activeSubordinates($chiefIds)
                    ->filter(fn (User $user) => $user->role_type === 'supervisor')
            );
        }

        return $supervisors
            ->filter(fn (User $user) => $locationId === null || $user->userLocations->contains('location_id', $locationId))
            ->unique('username')
            ->sortBy('name')
            ->values();
    }

    public function supervisorIds(User $manager, ?string $locationId = null): Collection
    {
        return $this->supervisors($manager, $locationId)->pluck('username')->values();
    }

    public function canAccessSupervisor(User $manager, string $supervisorId): bool
    {
        return $this->supervisorIds($manager)->contains($supervisorId);
    }

    public function managersForSupervisor(User $supervisor): Collection
    {
        $directManagers = $this->activeLeaders(collect([$supervisor->username]))
            ->filter(fn (User $user) => $user->role_type === 'manager')
            ->values();

        $chiefIds = $directManagers
            ->filter(fn (User $user) => $user->manager_type === 'CO')
            ->pluck('username');

        if ($chiefIds->isNotEmpty()) {
            $upperManagers = $this->activeLeaders($chiefIds)
                ->filter(fn (User $user) => $user->role_type === 'manager');
            $directManagers = $directManagers->merge($upperManagers);
        }

        return $directManagers
            ->unique('username')
            ->values();
    }

    private function activeSubordinates(Collection $leaderIds): Collection
    {
        if ($leaderIds->isEmpty()) {
            return collect();
        }

        $users = ReportingLine::query()
            ->whereIn('leader_id', $leaderIds)
            ->where('status', 'active')
            ->with('subordinate.userLocations')
            ->get()
            ->pluck('subordinate')
            ->filter(fn (?User $user) => $user?->active)
            ->unique('username')
            ->values();

        $this->loadOptionalUserRelations($users);

        return $users;
    }

    private function activeLeaders(Collection $subordinateIds): Collection
    {
        if ($subordinateIds->isEmpty()) {
            return collect();
        }

        $users = ReportingLine::query()
            ->whereIn('subordinate_id', $subordinateIds)
            ->where('status', 'active')
            ->with('leader.userLocations')
            ->get()
            ->pluck('leader')
            ->filter(fn (?User $user) => $user?->active)
            ->unique('username')
            ->values();

        $this->loadOptionalUserRelations($users);

        return $users;
    }

    private function loadOptionalUserRelations(Collection $users): void
    {
        if ($users->isEmpty()) {
            return;
        }

        $eloquentUsers = EloquentCollection::make($users->all());

        if ($eloquentUsers->contains(fn (User $user) => !empty($user->role_id))) {
            $eloquentUsers->loadMissing('accountRole');
        }

        if ($eloquentUsers->contains(fn (User $user) => !empty($user->job_level_id))) {
            $eloquentUsers->loadMissing('jobLevel');
        }
    }
}
