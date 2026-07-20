<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'employer_id',
        'work_station_id',
        'assignment_batch_id',
        'assignment_type',
        'title',
        'description',
        'start_at',
        'due_at',
        'weight_label',
        'weight_value',
        'status',
    ];

    protected $casts = [
        'start_at' => 'datetime',
        'due_at' => 'datetime',
    ];

    protected $appends = ['task_id', 'manager_id', 'note'];

    public function scopeActiveOnDate(Builder $query, Carbon|string $date): Builder
    {
        $targetDate = $date instanceof Carbon ? $date->copy() : Carbon::parse($date);

        return $query->where(function (Builder $scope) use ($targetDate) {
            $scope->where(function (Builder $batchTask) use ($targetDate) {
                $batchTask->whereNotNull('assignment_batch_id')
                    ->whereDate('start_at', $targetDate->toDateString());
            })->orWhere(function (Builder $individualTask) use ($targetDate) {
                $individualTask->whereNull('assignment_batch_id')
                    ->where(function (Builder $datedTask) use ($targetDate) {
                        $datedTask->where(function (Builder $taskWithStart) use ($targetDate) {
                            $taskWithStart->whereNotNull('start_at')
                                ->whereDate('start_at', $targetDate->toDateString());
                        })->orWhere(function (Builder $legacyTask) use ($targetDate) {
                            $legacyTask->whereNull('start_at')
                                ->where('created_at', '<=', $targetDate->copy()->endOfDay())
                                ->where('due_at', '>=', $targetDate->copy()->startOfDay());
                        });
                    });
            });
        });
    }

    public function getTaskIdAttribute()
    {
        return $this->id;
    }

    public function getManagerIdAttribute()
    {
        return $this->employer_id;
    }

    public function getNoteAttribute()
    {
        return $this->description;
    }

    public function assignedTo()
    {
        return $this->belongsTo(User::class, 'employee_id', 'username');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'employer_id', 'username');
    }

    public function workStation()
    {
        return $this->belongsTo(WorkStation::class);
    }

    public function assignmentBatch()
    {
        return $this->belongsTo(TaskAssignmentBatch::class, 'assignment_batch_id');
    }

    public function evidences()
    {
        return $this->hasMany(TaskEvidence::class);
    }
}
