<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskEvidence extends Model
{
    use HasFactory;

    protected $table = 'task_evidences';

    protected $fillable = [
        'task_id',
        'file_path',
        'type',
        'attempt_no',
        'review_status',
        'rejection_reason',
        'reviewed_by',
        'reviewed_at',
        'awarded_score',
    ];

    protected $casts = [
        'attempt_no' => 'integer',
        'reviewed_at' => 'datetime',
        'awarded_score' => 'float',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class);
    }
}
