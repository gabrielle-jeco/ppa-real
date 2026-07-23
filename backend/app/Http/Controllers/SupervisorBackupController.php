<?php

namespace App\Http\Controllers;

use App\Models\ReportingLine;
use App\Models\SupervisorBackupAssignment;
use App\Models\SupervisorBackupRequest;
use App\Models\User;
use App\Services\UserNotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SupervisorBackupController extends Controller
{
    public function options()
    {
        $supervisor = $this->supervisor();
        return response()->json($this->eligibleBackupSupervisors($supervisor)
            ->map(fn (User $candidate) => [
                'id' => $candidate->username,
                'name' => $candidate->name,
                'locations' => $candidate->locations
                    ->map(fn ($location) => $location->initial . ' - ' . $location->name)
                    ->values(),
            ])
            ->values());
    }

    public function index(Request $request)
    {
        $supervisor = $this->supervisor();
        $relations = ['requester:username,name', 'backupSupervisor:username,name'];
        $perPage = min(max($request->integer('per_page', 5), 1), 10);
        $outgoingPage = max($request->integer('outgoing_page', 1), 1);
        $incomingPage = max($request->integer('incoming_page', 1), 1);

        $outgoing = SupervisorBackupRequest::with($relations)
            ->withCount('assignments')
            ->where('requester_id', $supervisor->username)
            ->latest()
            ->paginate($perPage, ['*'], 'outgoing_page', $outgoingPage);

        $incomingQuery = SupervisorBackupRequest::with($relations)
            ->withCount('assignments')
            ->where('backup_supervisor_id', $supervisor->username);
        $incoming = (clone $incomingQuery)
            ->latest()
            ->paginate($perPage, ['*'], 'incoming_page', $incomingPage);

        return response()->json([
            'outgoing' => $outgoing->getCollection()
                ->map(fn (SupervisorBackupRequest $request) => $this->formatRequest($request)),
            'incoming' => $incoming->getCollection()
                ->map(fn (SupervisorBackupRequest $request) => $this->formatRequest($request)),
            'pagination' => [
                'outgoing' => $this->paginationMeta($outgoing),
                'incoming' => $this->paginationMeta($incoming),
            ],
            'pending_incoming_count' => SupervisorBackupRequest::where('backup_supervisor_id', $supervisor->username)
                ->where('status', 'pending')
                ->count(),
        ]);
    }

    public function store(Request $request, UserNotificationService $notifications)
    {
        $supervisor = $this->supervisor();
        $data = $request->validate([
            'backup_supervisor_id' => [
                'required',
                'string',
                'different:requester_id',
                Rule::exists('users', 'username')->where('active', true),
            ],
            'start_date' => ['required', 'date', 'after_or_equal:today'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        if ($data['backup_supervisor_id'] === $supervisor->username) {
            throw ValidationException::withMessages([
                'backup_supervisor_id' => ['Supervisor backup harus berbeda dari pemohon.'],
            ]);
        }

        $eligible = $this->eligibleBackupIds($supervisor);
        if (!$eligible->contains($data['backup_supervisor_id'])) {
            throw ValidationException::withMessages([
                'backup_supervisor_id' => ['Supervisor backup harus aktif dan berada di toko yang sama.'],
            ]);
        }

        $hasOverlap = SupervisorBackupRequest::where('requester_id', $supervisor->username)
            ->whereIn('status', ['pending', 'approved'])
            ->whereDate('start_date', '<=', $data['end_date'])
            ->whereDate('end_date', '>=', $data['start_date'])
            ->exists();

        if ($hasOverlap) {
            throw ValidationException::withMessages([
                'start_date' => ['Sudah ada pengajuan backup yang aktif atau menunggu pada rentang tanggal tersebut.'],
            ]);
        }

        $backupRequest = SupervisorBackupRequest::create([
            'requester_id' => $supervisor->username,
            'backup_supervisor_id' => $data['backup_supervisor_id'],
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
            'reason' => $data['reason'] ?? null,
            'status' => 'pending',
        ]);

        $notifications->createAndPush(
            $backupRequest->backup_supervisor_id,
            'supervisor_backup_requested',
            'Permintaan Backup Supervisor',
            $supervisor->name . ' meminta Anda menjadi supervisor backup.',
            Carbon::parse($data['start_date'])->format('d/m/Y') . ' - ' . Carbon::parse($data['end_date'])->format('d/m/Y'),
            ['backup_request_id' => $backupRequest->id, 'url' => '/', 'tag' => 'backup-request-' . $backupRequest->id],
            'backup-request-' . $backupRequest->id
        );

        return response()->json(
            $this->formatRequest($backupRequest->load(['requester', 'backupSupervisor'])->loadCount('assignments')),
            201
        );
    }

    public function respond(
        Request $request,
        SupervisorBackupRequest $backupRequest,
        UserNotificationService $notifications
    ) {
        $supervisor = $this->supervisor();
        $data = $request->validate([
            'decision' => ['required', Rule::in(['approved', 'rejected'])],
        ]);

        if ($backupRequest->backup_supervisor_id !== $supervisor->username) {
            return response()->json(['message' => 'Anda tidak memiliki akses ke pengajuan ini.'], 403);
        }

        $updated = DB::transaction(function () use ($backupRequest, $data) {
            $lockedRequest = SupervisorBackupRequest::query()
                ->lockForUpdate()
                ->findOrFail($backupRequest->id);

            if ($lockedRequest->status !== 'pending') {
                throw ValidationException::withMessages([
                    'decision' => ['Pengajuan ini sudah diproses.'],
                ]);
            }

            if ($data['decision'] === 'approved' && $lockedRequest->end_date->copy()->endOfDay()->isPast()) {
                throw ValidationException::withMessages([
                    'decision' => ['Periode backup sudah berakhir dan tidak dapat disetujui.'],
                ]);
            }

            if ($data['decision'] === 'approved') {
                $this->activateBackupRelations($lockedRequest);
            }

            $lockedRequest->update([
                'status' => $data['decision'],
                'responded_at' => now(),
            ]);

            return $lockedRequest;
        });

        $approved = $updated->status === 'approved';
        $notifications->createAndPush(
            $updated->requester_id,
            $approved ? 'supervisor_backup_approved' : 'supervisor_backup_rejected',
            $approved ? 'Backup Supervisor Disetujui' : 'Backup Supervisor Ditolak',
            $approved
                ? $supervisor->name . ' menyetujui permintaan backup Anda.'
                : $supervisor->name . ' menolak permintaan backup Anda.',
            $approved
                ? 'Akses backup akan aktif sesuai rentang tanggal pengajuan.'
                : 'Silakan ajukan kembali kepada supervisor lain.',
            ['backup_request_id' => $updated->id, 'url' => '/', 'tag' => 'backup-response-' . $updated->id],
            'backup-response-' . $updated->id
        );

        return response()->json(
            $this->formatRequest($updated->load(['requester', 'backupSupervisor'])->loadCount('assignments'))
        );
    }

    private function supervisor(): User
    {
        $user = Auth::user();
        abort_unless($user && $user->role_type === 'supervisor', 403, 'Hanya supervisor yang dapat menggunakan fitur backup.');

        return $user;
    }

    private function eligibleBackupIds(User $supervisor)
    {
        return $this->eligibleBackupSupervisors($supervisor)->pluck('username');
    }

    private function eligibleBackupSupervisors(User $supervisor)
    {
        $locationIds = $supervisor->locations()->pluck('locations.initial');
        if ($locationIds->isEmpty()) {
            return collect();
        }

        return User::query()
            ->with([
                'accountRole:id,name,permissions',
                'userLocations:id,user_id,job_level',
                'locations:initial,name',
            ])
            ->where('active', true)
            ->where('username', '!=', $supervisor->username)
            ->whereHas('userLocations', fn ($userLocations) => $userLocations
                ->whereRaw('LOWER(TRIM(job_level)) = ?', ['supervisor']))
            ->whereHas('locations', fn ($locations) => $locations
                ->whereIn('locations.initial', $locationIds))
            ->orderBy('name')
            ->get(['username', 'name', 'role_id'])
            ->filter(fn (User $candidate) => $candidate->role_type === 'supervisor')
            ->values();
    }

    private function activateBackupRelations(SupervisorBackupRequest $backupRequest): void
    {
        $crewIds = ReportingLine::withoutGlobalScope('effective_backup_period')
            ->where('leader_id', $backupRequest->requester_id)
            ->where('status', 'active')
            ->where('relation_type', 'permanent')
            ->pluck('subordinate_id')
            ->unique();

        foreach ($crewIds as $crewId) {
            $line = ReportingLine::withoutGlobalScope('effective_backup_period')
                ->where('leader_id', $backupRequest->backup_supervisor_id)
                ->where('subordinate_id', $crewId)
                ->first();

            $createdTemporaryLine = false;
            if ($line?->relation_type === 'permanent' && $line->status !== 'active') {
                throw ValidationException::withMessages([
                    'decision' => ['Terdapat relasi permanen nonaktif dengan salah satu crew. Aktifkan atau hapus relasi tersebut melalui CMS terlebih dahulu.'],
                ]);
            }

            if ($line?->relation_type === 'backup' && $line->backup_request_id !== $backupRequest->id) {
                $existingRequest = SupervisorBackupRequest::find($line->backup_request_id);
                $overlaps = $existingRequest
                    && in_array($existingRequest->status, ['pending', 'approved'], true)
                    && $existingRequest->start_date->lte($backupRequest->end_date)
                    && $existingRequest->end_date->gte($backupRequest->start_date);

                if ($overlaps) {
                    throw ValidationException::withMessages([
                        'decision' => ['Crew yang sama sudah tercakup dalam periode backup lain untuk supervisor tersebut.'],
                    ]);
                }
            }

            if (!$line || $line->relation_type === 'backup') {
                $line ??= new ReportingLine([
                    'leader_id' => $backupRequest->backup_supervisor_id,
                    'subordinate_id' => $crewId,
                ]);
                $line->fill([
                    'status' => 'active',
                    'relation_type' => 'backup',
                    'backup_request_id' => $backupRequest->id,
                    'effective_from' => $backupRequest->start_date,
                    'effective_until' => $backupRequest->end_date,
                ])->save();
                $createdTemporaryLine = true;
            }

            SupervisorBackupAssignment::updateOrCreate(
                ['backup_request_id' => $backupRequest->id, 'subordinate_id' => $crewId],
                ['reporting_line_id' => $line->id, 'created_temporary_line' => $createdTemporaryLine]
            );
        }
    }

    private function formatRequest(SupervisorBackupRequest $request): array
    {
        $today = Carbon::today();
        $displayStatus = $request->status === 'approved' && $request->end_date->lt($today)
            ? 'expired'
            : $request->status;

        return [
            'id' => $request->id,
            'requester' => [
                'id' => $request->requester_id,
                'name' => $request->requester?->name ?? $request->requester_id,
            ],
            'backup_supervisor' => [
                'id' => $request->backup_supervisor_id,
                'name' => $request->backupSupervisor?->name ?? $request->backup_supervisor_id,
            ],
            'start_date' => $request->start_date->toDateString(),
            'end_date' => $request->end_date->toDateString(),
            'reason' => $request->reason,
            'status' => $displayStatus,
            'is_active' => $request->status === 'approved'
                && $request->start_date->lte($today)
                && $request->end_date->gte($today),
            'crew_count' => (int) ($request->assignments_count ?? 0),
            'created_at' => optional($request->created_at)->toISOString(),
            'responded_at' => optional($request->responded_at)->toISOString(),
        ];
    }

    private function paginationMeta($paginator): array
    {
        return [
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
        ];
    }
}
