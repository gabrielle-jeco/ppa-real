<?php

namespace App\Models;

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
        'role_id',
        'initial_store',
        'active',
        'is_back_office',
    ];

    protected $casts = [
        'active' => 'boolean',
        'is_back_office' => 'boolean',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $appends = ['role_type', 'location_id', 'manager_type', 'user_id', 'full_name'];

    public function getUserIdAttribute()
    {
        return $this->username;
    }

    public function getFullNameAttribute()
    {
        return $this->name;
    }

    public function getRoleTypeAttribute()
    {
        if ($this->accountRole?->isCmsRole()) {
            return 'superadmin';
        }

        $appRole = $this->effectiveAppJobLevel();
        if ($appRole === 'sc') {
            return 'employee';
        }

        if ($appRole === 'regional_manager') {
            return 'manager';
        }

        return $appRole;
    }

    public function getLocationIdAttribute()
    {
        $location = $this->locations->first();
        return $location ? $location->initial : null;
    }

    public function getManagerTypeAttribute()
    {
        $appRole = $this->effectiveAppJobLevel();
        if ($appRole === 'regional_manager') {
            return 'RM';
        }

        if ($appRole === 'manager') {
            return 'SM';
        }

        if ($this->role_type === 'manager') {
            return $this->locations->count() > 1 ? 'RM' : 'SM';
        }
        return null;
    }

    public function jobLevel()
    {
        return $this->belongsTo(JobLevel::class);
    }

    public function accountRole()
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function locations()
    {
        return $this->belongsToMany(Location::class, 'user_locations', 'user_id', 'location_id', 'username', 'initial')
            ->withPivot('job_level');
    }

    public function userLocations()
    {
        return $this->hasMany(UserLocation::class, 'user_id', 'username');
    }

    private function effectiveAppJobLevel(): ?string
    {
        $priority = ['regional_manager', 'manager', 'supervisor', 'sc'];
        $levels = $this->userLocations
            ->pluck('job_level')
            ->filter()
            ->map(fn($level) => strtolower(trim((string) $level)));

        foreach ($priority as $level) {
            if ($levels->contains($level)) {
                return $level;
            }
        }

        if ($levels->isNotEmpty()) {
            return $levels->first();
        }

        return null;
    }

    public function subordinateLines()
    {
        return $this->hasMany(ReportingLine::class, 'leader_id', 'username');
    }

    public function leaderLines()
    {
        return $this->hasMany(ReportingLine::class, 'subordinate_id', 'username');
    }

    public function tasksAssigned()
    {
        return $this->hasMany(Task::class, 'employee_id', 'username');
    }

    public function tasksCreated()
    {
        return $this->hasMany(Task::class, 'employer_id', 'username');
    }

    public function attendances()
    {
        return $this->hasMany(Attendance::class, 'user_id', 'username');
    }

    public function evaluationsReceived()
    {
        return $this->hasMany(MonthlyPersonalityEvaluation::class, 'evaluatee_id', 'username');
    }

    public function evaluationsGiven()
    {
        return $this->hasMany(MonthlyPersonalityEvaluation::class, 'evaluator_id', 'username');
    }

    public function activityLogs()
    {
        return $this->hasMany(ActivityLog::class, 'user_id', 'username');
    }

    public function pushSubscriptions()
    {
        return $this->hasMany(PushSubscription::class, 'user_id', 'username');
    }

    public function userNotifications()
    {
        return $this->hasMany(UserNotification::class, 'recipient_id', 'username');
    }
}
