<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskDefinition extends Model
{
    use HasFactory;

    protected $fillable = ['task_area_id', 'title', 'sort_order', 'active'];

    protected $casts = [
        'sort_order' => 'integer',
        'active' => 'boolean',
    ];

    public function taskArea()
    {
        return $this->belongsTo(TaskArea::class);
    }

    public function tasks()
    {
        return $this->hasMany(Task::class);
    }

    public function assignmentBatches()
    {
        return $this->hasMany(TaskAssignmentBatch::class);
    }
}
