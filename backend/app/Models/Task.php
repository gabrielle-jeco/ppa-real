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
        'title',
        'description',
        'due_at',
        'status',
    ];

    protected $casts = [
        'due_at' => 'datetime',
    ];

    protected $appends = ['task_id', 'manager_id', 'note'];

    public function scopeActiveOnDate(Builder $query, Carbon|string $date): Builder
    {
        $targetDate = $date instanceof Carbon ? $date->copy() : Carbon::parse($date);

        return $query
            ->where('created_at', '<=', $targetDate->copy()->endOfDay())
            ->where('due_at', '>=', $targetDate->copy()->startOfDay());
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

    public function evidences()
    {
        return $this->hasMany(TaskEvidence::class);
    }
}
