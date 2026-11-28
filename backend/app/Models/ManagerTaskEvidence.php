<?php
namespace App\Models;

class ManagerTaskEvidence extends TaskEvidence
{
    protected $table = 'manager_task_evidences';
    public function task() { return $this->belongsTo(ManagerTask::class, 'task_id'); }
}
