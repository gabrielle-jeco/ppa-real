<?php

namespace App\Services;

use App\Models\ReportingLine;
use App\Models\SupervisorBackupAssignment;
use App\Models\SupervisorBackupRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BackupMirrorService
{
    public function syncForRequest(SupervisorBackupRequest $request): void
    {
        $ids = DB::table('reporting_lines')->where('leader_id', $request->requester_id)
            ->where('relation_type', 'permanent')->pluck('subordinate_id')
            ->merge($request->assignments()->pluck('subordinate_id'))->unique()->all();
        $this->syncForCrew($ids);
    }

    public function syncForCrew(array $crewIds): void
    {
        $crewIds = array_values(array_unique(array_filter($crewIds)));
        if ($crewIds === []) return;
        DB::transaction(function () use ($crewIds) {
            $sourceLeaders = DB::table('reporting_lines')->whereIn('subordinate_id', $crewIds)
                ->where('relation_type', 'permanent')->pluck('leader_id');
            $historicalRequests = SupervisorBackupAssignment::whereIn('subordinate_id', $crewIds)->pluck('backup_request_id');
            $requests = SupervisorBackupRequest::where('status', 'approved')->whereDate('end_date', '>=', today())
                ->where(fn($query) => $query->whereIn('requester_id', $sourceLeaders)->orWhereIn('id', $historicalRequests))
                ->orderBy('start_date', 'desc')->orderBy('id')->lockForUpdate()->get();
            foreach ($requests as $request) {
                $active = DB::table('reporting_lines')->where('leader_id', $request->requester_id)
                    ->whereIn('subordinate_id', $crewIds)->where('relation_type', 'permanent')->where('status', 'active')->pluck('subordinate_id');
                foreach ($crewIds as $crewId) {
                    $line = ReportingLine::withoutGlobalScope('effective_backup_period')
                        ->where('leader_id', $request->backup_supervisor_id)->where('subordinate_id', $crewId)->lockForUpdate()->first();
                    if (!$active->contains($crewId)) {
                        if ($line && $line->relation_type === 'backup' && (int) $line->backup_request_id === $request->id && $line->status !== 'inactive') $line->update(['status' => 'inactive']);
                        continue;
                    }
                    if ($line?->relation_type === 'permanent' && $line->status !== 'active') {
                        throw ValidationException::withMessages(['relation' => ['Relasi permanen nonaktif pada supervisor backup harus diselesaikan terlebih dahulu.']]);
                    }
                    if ($line?->relation_type === 'backup' && (int) $line->backup_request_id !== $request->id) {
                        $other = SupervisorBackupRequest::find($line->backup_request_id);
                        if ($other && in_array($other->status, ['pending', 'approved'], true) && $other->start_date->lte($request->end_date) && $other->end_date->gte($request->start_date)) {
                            throw ValidationException::withMessages(['relation' => ['Crew sudah tercakup dalam backup lain pada supervisor dan periode yang sama.']]);
                        }
                    }
                    $temporary = !$line || $line->relation_type === 'backup';
                    if ($temporary) {
                        $line ??= new ReportingLine(['leader_id' => $request->backup_supervisor_id, 'subordinate_id' => $crewId]);
                        $line->fill(['status' => 'active', 'relation_type' => 'backup', 'backup_request_id' => $request->id,
                            'effective_from' => $request->start_date, 'effective_until' => $request->end_date]);
                        if (!$line->exists || $line->isDirty()) $line->save();
                    }
                    SupervisorBackupAssignment::updateOrCreate(
                        ['backup_request_id' => $request->id, 'subordinate_id' => $crewId],
                        ['reporting_line_id' => $line->id, 'created_temporary_line' => $temporary]
                    );
                }
            }
        });
    }
}
