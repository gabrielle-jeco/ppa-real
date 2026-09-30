<?php

namespace App\Services;

use App\Models\SupervisorBackupAssignment;
use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class SupervisorTaskAccessService
{
    public function canReviewTask(User $reviewer, Task $task, Carbon $date): bool
    {
        if ($task->employer_id === $reviewer->username) {
            return true;
        }

        return $this->reviewableBackupPairs($reviewer, [$task->employee_id], $date)
            ->contains(fn (array $pair) => $pair['crew_id'] === $task->employee_id
                && $pair['requester_id'] === $task->employer_id);
    }

    public function reviewableBackupPairs(User $reviewer, iterable $crewIds, Carbon $date): Collection
    {
        if ($reviewer->role_type !== 'supervisor') {
            return collect();
        }

        $crewIds = collect($crewIds)->filter()->unique()->values();
        if ($crewIds->isEmpty()) {
            return collect();
        }

        return SupervisorBackupAssignment::query()
            ->join(
                'supervisor_backup_requests as backup_requests',
                'backup_requests.id',
                '=',
                'supervisor_backup_assignments.backup_request_id'
            )
            ->where('backup_requests.backup_supervisor_id', $reviewer->username)
            ->where('backup_requests.status', 'approved')
            ->whereDate('backup_requests.start_date', '<=', $date->toDateString())
            ->whereDate('backup_requests.end_date', '>=', $date->toDateString())
            ->whereIn('supervisor_backup_assignments.subordinate_id', $crewIds)
            ->get([
                'supervisor_backup_assignments.subordinate_id',
                'backup_requests.requester_id',
            ])
            ->map(fn ($assignment) => [
                'crew_id' => (string) $assignment->subordinate_id,
                'requester_id' => (string) $assignment->requester_id,
            ])
            ->unique(fn (array $pair) => $pair['crew_id'] . '|' . $pair['requester_id'])
            ->values();
    }

    public function constrainReviewableTasks(
        Builder $query,
        User $reviewer,
        Collection $backupPairs
    ): Builder {
        return $query->where(function (Builder $access) use ($reviewer, $backupPairs) {
            $access->where('employer_id', $reviewer->username);

            foreach ($backupPairs as $pair) {
                $access->orWhere(function (Builder $backupAccess) use ($pair) {
                    $backupAccess
                        ->where('employee_id', $pair['crew_id'])
                        ->where('employer_id', $pair['requester_id']);
                });
            }
        });
    }
}
