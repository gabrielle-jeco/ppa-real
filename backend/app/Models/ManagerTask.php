<?php
namespace App\Models;

class ManagerTask extends Task
{
    protected $table = 'manager_tasks';

    public function __construct(array $attributes = [])
    {
        $this->mergeFillable(['target']);
        parent::__construct($attributes);
        $this->append('task_context');
    }

    public function getTaskContextAttribute(): string { return 'manager_supervisor'; }

    public function assignmentBatch()
    {
        return $this->belongsTo(ManagerTaskAssignmentBatch::class, 'assignment_batch_id');
    }

    public function evidences()
    {
        return $this->hasMany(ManagerTaskEvidence::class, 'task_id');
    }
}
