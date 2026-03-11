<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'employer_id',
        'title',
        'description',
        'due_at',
        'status',
    ];

    protected $casts = [
        'due_at' => 'datetime',
    ];

    protected $appends = ['task_id', 'manager_id', 'note'];

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
        return $this->belongsTo(User::class, 'employee_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'employer_id');
    }

    public function evidences()
    {
        return $this->hasMany(TaskEvidence::class);
    }
}
