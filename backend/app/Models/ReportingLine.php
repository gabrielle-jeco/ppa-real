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
        static::saved(function (ReportingLine $line) {
            if ($line->relation_type === 'permanent') app(\App\Services\BackupMirrorService::class)->syncForCrew([$line->subordinate_id, $line->getOriginal('subordinate_id')]);
        });
        static::deleted(function (ReportingLine $line) {
            if ($line->relation_type === 'permanent') app(\App\Services\BackupMirrorService::class)->syncForCrew([$line->subordinate_id]);
        });
        static::addGlobalScope('effective_backup_period', function (Builder $builder) {
            $today = Carbon::today()->toDateString();

            $builder->where(function (Builder $query) use ($today) {
                $query->where('relation_type', 'permanent')
                    ->orWhere(function (Builder $backup) use ($today) {
                        $backup->where('relation_type', 'backup')
                            ->whereDate('effective_from', '<=', $today)
                            ->whereDate('effective_until', '>=', $today)
                            ->whereExists(function ($request) use ($today) {
                                $request->selectRaw('1')->from('supervisor_backup_requests as mirror_request')
                                    ->join('reporting_lines as mirror_source', 'mirror_source.leader_id', '=', 'mirror_request.requester_id')
                                    ->whereColumn('mirror_request.id', 'reporting_lines.backup_request_id')
                                    ->whereColumn('mirror_request.backup_supervisor_id', 'reporting_lines.leader_id')
                                    ->where('mirror_request.status', 'approved')
                                    ->whereDate('mirror_request.start_date', '<=', $today)
                                    ->whereDate('mirror_request.end_date', '>=', $today)
                                    ->whereColumn('mirror_source.subordinate_id', 'reporting_lines.subordinate_id')
                                    ->where('mirror_source.relation_type', 'permanent')->where('mirror_source.status', 'active');
                            });
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
