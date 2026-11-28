<?php
namespace App\Services;

use App\Models\Task;
use App\Models\User;

class TaskAssignmentAccessService
{
    public function __construct(private ManagerScopeService $managerScope) {}

    public function recipientIds(User $actor, ?string $locationId = null): \Illuminate\Support\Collection
    {
        abort_unless($actor->active && $actor->role_type === 'manager', 403);
        $locations = $this->managerScope->accessibleLocations($actor);
        if ($locationId !== null && $locationId !== '') {
            abort_unless($locations->contains('initial', $locationId), 403);
            $locations = $locations->where('initial', $locationId);
        }
        return $locations->flatMap(fn ($location) => $this->managerScope->supervisorIds($actor, $location->initial))->unique()->values();
    }

    public function canAssign(User $actor, string $supervisorId, ?string $locationId = null): bool
    {
        return $actor->active && $actor->role_type === 'manager'
            && $this->recipientIds($actor, $locationId)->contains($supervisorId);
    }

    public function canReview(User $actor, Task $task): bool
    {
        return $this->canAssign($actor, $task->employee_id);
    }

    public function canManage(User $actor, Task $task): bool
    {
        return $task->employer_id === $actor->username && $this->canReview($actor, $task);
    }

    public function canRead(User $actor, Task $task): bool
    {
        return $actor->active && ($actor->username === $task->employee_id || $this->canReview($actor, $task));
    }
}
