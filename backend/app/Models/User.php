<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'username',
        'email',
        'password',
        'job_level_id',
        'active',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $appends = ['role_type', 'location_id', 'manager_type', 'user_id', 'full_name'];
    protected $with = ['jobLevel', 'locations'];

    public function getUserIdAttribute()
    {
        return $this->id;
    }

    public function getFullNameAttribute()
    {
        return $this->name;
    }

    public function getRoleTypeAttribute()
    {
        $roleName = $this->jobLevel ? $this->jobLevel->name : null;
        return $roleName === 'crew' ? 'employee' : $roleName;
    }

    public function getLocationIdAttribute()
    {
        $location = $this->locations->first();
        return $location ? $location->id : null;
    }

    public function getManagerTypeAttribute()
    {
        if ($this->jobLevel && $this->jobLevel->name === 'manager') {
            return $this->locations->count() > 1 ? 'RM' : 'SM';
        }
        return null;
    }

    public function jobLevel()
    {
        return $this->belongsTo(JobLevel::class);
    }

    public function locations()
    {
        return $this->belongsToMany(Location::class, 'user_locations', 'user_id', 'location_id');
    }

    public function subordinateLines()
    {
        return $this->hasMany(ReportingLine::class, 'leader_id');
    }

    public function leaderLines()
    {
        return $this->hasMany(ReportingLine::class, 'subordinate_id');
    }

    public function tasksAssigned()
    {
        return $this->hasMany(Task::class, 'employee_id');
    }

    public function tasksCreated()
    {
        return $this->hasMany(Task::class, 'employer_id');
    }

    public function attendances()
    {
        return $this->hasMany(Attendance::class);
    }

    public function evaluationsReceived()
    {
        return $this->hasMany(MonthlyPersonalityEvaluation::class, 'evaluatee_id');
    }

    public function evaluationsGiven()
    {
        return $this->hasMany(MonthlyPersonalityEvaluation::class, 'evaluator_id');
    }

    public function activityLogs()
    {
        return $this->hasMany(ActivityLog::class);
    }
}
