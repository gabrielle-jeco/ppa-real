<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskAssignmentBatch extends Model
{
    use HasFactory;

    protected $fillable = [
        'created_by',
        'assignment_type',
        'title',
        'description',
        'work_station_id',
        'start_date',
        'end_date',
        'start_time',
        'due_time',
        'repeat_days',
        'weight_label',
        'weight_value',
        'crew_ids',
    ];

    protected $casts = [
        'repeat_days' => 'array',
        'crew_ids' => 'array',
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by', 'username');
    }

    public function tasks()
    {
        return $this->hasMany(Task::class, 'assignment_batch_id');
    }
}
