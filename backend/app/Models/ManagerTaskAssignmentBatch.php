<?php
namespace App\Models;

class ManagerTaskAssignmentBatch extends TaskAssignmentBatch
{
    protected $table = 'manager_task_assignment_batches';

    public function __construct(array $attributes = [])
    {
        $this->mergeFillable(['target', 'supervisor_ids']);
        parent::__construct($attributes);
        $this->mergeCasts(['supervisor_ids'=>'array']);
    }

    public function getTaskContextAttribute(): string { return 'manager_supervisor'; }

    // The shared scheduling engine uses crew_ids internally; storage and API use supervisor_ids.
    public function setCrewIdsAttribute($ids): void { $this->attributes['supervisor_ids'] = json_encode($ids); }
    public function getCrewIdsAttribute(): array { return $this->supervisor_ids ?? []; }

    public function tasks()
    {
        return $this->hasMany(ManagerTask::class, 'assignment_batch_id');
    }
}
