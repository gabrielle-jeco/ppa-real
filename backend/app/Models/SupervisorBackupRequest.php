<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SupervisorBackupRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'requester_id',
        'backup_supervisor_id',
        'start_date',
        'end_date',
        'reason',
        'status',
        'responded_at',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'responded_at' => 'datetime',
    ];

    public function requester()
    {
        return $this->belongsTo(User::class, 'requester_id', 'username');
    }

    public function backupSupervisor()
    {
        return $this->belongsTo(User::class, 'backup_supervisor_id', 'username');
    }

    public function assignments()
    {
        return $this->hasMany(SupervisorBackupAssignment::class, 'backup_request_id');
    }
}
