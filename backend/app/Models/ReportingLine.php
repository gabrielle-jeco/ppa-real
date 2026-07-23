<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReportingLine extends Model
{
    use HasFactory;

    protected $fillable = [
        'subordinate_id',
        'leader_id',
        'status',
        'relation_type',
        'backup_request_id',
        'effective_from',
        'effective_until',
    ];

    protected $casts = [
        'effective_from' => 'date',
        'effective_until' => 'date',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope('effective_backup_period', function (Builder $builder) {
            $today = Carbon::today()->toDateString();

            $builder->where(function (Builder $query) use ($today) {
                $query->where('relation_type', 'permanent')
                    ->orWhere(function (Builder $backup) use ($today) {
                        $backup->where('relation_type', 'backup')
                            ->whereDate('effective_from', '<=', $today)
                            ->whereDate('effective_until', '>=', $today);
                    });
            });
        });
    }

    public function subordinate()
    {
        return $this->belongsTo(User::class, 'subordinate_id', 'username');
    }

    public function leader()
    {
        return $this->belongsTo(User::class, 'leader_id', 'username');
    }

    public function backupRequest()
    {
        return $this->belongsTo(SupervisorBackupRequest::class, 'backup_request_id');
    }
}
