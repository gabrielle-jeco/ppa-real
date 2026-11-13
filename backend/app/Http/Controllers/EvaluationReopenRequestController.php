<?php

namespace App\Http\Controllers;

use App\Models\EvaluationReopenRequest;
use App\Models\MonthlyPersonalityEvaluation;
use App\Models\User;
use App\Services\UserNotificationService;
use App\Services\ManagerScopeService;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class EvaluationReopenRequestController extends Controller
{
    public function __construct(private ManagerScopeService $managerScope)
    {
    }

    public function store(Request $request, string $crew, UserNotificationService $notifications)
    {
        $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $supervisor = Auth::user();
        $evaluatee = User::where('username', $crew)->firstOrFail();
        if (!$supervisor || $supervisor->role_type !== 'supervisor' || !$this->isActiveLeaderOf($supervisor, $evaluatee)) {
            return response()->json(['message' => 'Tidak memiliki akses untuk mengajukan perpanjangan evaluasi ini.'], 403);
        }

        $period = now()->copy()->subMonthNoOverflow()->startOfMonth();
        if (now()->lte(now()->copy()->startOfMonth()->addDays(5)->endOfDay())) {
            return response()->json(['message' => 'Perpanjangan hanya dapat diajukan setelah periode evaluasi tanggal 1-6 berakhir.'], 422);
        }

        if ($this->evaluationExists($supervisor->username, $evaluatee->username, $period)) {
            return response()->json(['message' => 'Evaluasi periode ini sudah selesai dan tidak dapat dibuka kembali.'], 422);
        }

        try {
            $reopenRequest = DB::transaction(function () use ($request, $supervisor, $evaluatee, $period) {
                $query = EvaluationReopenRequest::where('requester_id', $supervisor->username)
                    ->where('evaluatee_id', $evaluatee->username)
                    ->whereDate('evaluation_period', $period->toDateString())
                    ->where('evaluation_type', 'personality');

                $this->expireElapsedApprovals(clone $query);
                $existingRequests = (clone $query)->lockForUpdate()->get();
                $attempts = $existingRequests->count();
                $blockingRequest = $existingRequests->first(function (EvaluationReopenRequest $item) {
                    return $item->status === 'pending'
                        || ($item->status === 'approved' && $item->expires_at?->isFuture());
                });

                if ($blockingRequest) {
                    throw ValidationException::withMessages([
                        'request' => [$blockingRequest->status === 'pending'
                            ? 'Pengajuan sebelumnya masih menunggu keputusan.'
                            : 'Perpanjangan evaluasi masih aktif.'],
                    ]);
                }

                if ($attempts >= EvaluationReopenRequest::MAX_ATTEMPTS) {
                    throw ValidationException::withMessages([
                        'request' => ['Batas maksimal 3 pengajuan untuk karyawan dan periode ini sudah tercapai.'],
                    ]);
                }

                return EvaluationReopenRequest::create([
                    'requester_id' => $supervisor->username,
                    'evaluatee_id' => $evaluatee->username,
                    'evaluation_period' => $period->toDateString(),
                    'evaluation_type' => 'personality',
                    'attempt' => $attempts + 1,
                    'status' => 'pending',
                    'reason' => $request->filled('reason') ? trim($request->reason) : null,
                ]);
            });
        } catch (QueryException $error) {
            if ((string) $error->getCode() === '23000' || (string) $error->getCode() === '23505') {
                return response()->json(['message' => 'Pengajuan serupa baru saja dibuat. Muat ulang halaman untuk melihat status terbaru.'], 409);
            }
            throw $error;
        }

        $supervisor->leaderLines()
            ->where('status', 'active')
            ->with('leader')
            ->get()
            ->pluck('leader')
            ->filter(fn ($leader) => $leader && $leader->active && $leader->role_type === 'manager')
            ->unique('username')
            ->each(function (User $manager) use ($notifications, $reopenRequest, $supervisor, $evaluatee) {
                $notifications->createAndPush(
                    $manager->username,
                    'evaluation_reopen_requested',
                    'Permintaan Perpanjangan Evaluasi',
                    $supervisor->name . ' meminta perpanjangan evaluasi untuk ' . $evaluatee->name . '.',
                    $reopenRequest->reason,
                    ['request_id' => $reopenRequest->id, 'url' => '/', 'tag' => 'evaluation-reopen-' . $reopenRequest->id]
                );
            });

        return response()->json([
            'message' => 'Permintaan perpanjangan evaluasi berhasil dikirim.',
            'request' => $this->serialize($reopenRequest->load(['requester', 'evaluatee'])),
        ], 201);
    }

    public function index(Request $request)
    {
        $request->validate([
            'status' => ['nullable', Rule::in(['pending', 'approved', 'rejected', 'expired', 'completed'])],
            'tab' => ['nullable', Rule::in(['pending', 'history'])],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,20'],
        ]);

        $manager = Auth::user();
        if (!$manager || $manager->role_type !== 'manager') {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        $supervisorIds = $this->managerScope->supervisorIds($manager);

        EvaluationReopenRequest::whereIn('requester_id', $supervisorIds)
            ->where('status', 'approved')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired', 'updated_at' => now()]);

        $baseQuery = EvaluationReopenRequest::with(['requester', 'evaluatee', 'reviewer'])
            ->whereIn('requester_id', $supervisorIds);
        $pendingCount = (clone $baseQuery)->where('status', 'pending')->count();

        if ($request->filled('status')) {
            $baseQuery->where('status', $request->status);
        } elseif ($request->input('tab') === 'pending') {
            $baseQuery->where('status', 'pending');
        } elseif ($request->input('tab') === 'history') {
            $baseQuery->whereIn('status', ['approved', 'rejected', 'expired', 'completed']);
        }

        if ($request->filled('search')) {
            $search = '%' . mb_strtolower(trim($request->search)) . '%';
            $baseQuery->where(function ($query) use ($search) {
                $query
                    ->whereRaw('LOWER(requester_id) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(evaluatee_id) LIKE ?', [$search])
                    ->orWhereHas('requester', function ($userQuery) use ($search) {
                        $userQuery->whereRaw('LOWER(name) LIKE ?', [$search]);
                    })
                    ->orWhereHas('evaluatee', function ($userQuery) use ($search) {
                        $userQuery->whereRaw('LOWER(name) LIKE ?', [$search]);
                    });
            });
        }

        $requests = $baseQuery
            ->latest('id')
            ->paginate($request->integer('per_page', 8));

        return response()->json([
            'pending_count' => $pendingCount,
            'requests' => $requests->getCollection()->map(fn ($item) => $this->serialize($item)),
            'pagination' => [
                'current_page' => $requests->currentPage(),
                'last_page' => $requests->lastPage(),
                'per_page' => $requests->perPage(),
                'total' => $requests->total(),
            ],
        ]);
    }

    public function review(Request $request, EvaluationReopenRequest $evaluationReopenRequest, UserNotificationService $notifications)
    {
        $request->validate([
            'decision' => ['required', Rule::in(['approved', 'rejected'])],
            'rejection_reason' => [Rule::requiredIf($request->input('decision') === 'rejected'), 'nullable', 'string', 'max:2000'],
        ]);

        $manager = Auth::user();
        if (!$manager || $manager->role_type !== 'manager' || !$this->managerOwnsRequest($manager, $evaluationReopenRequest)) {
            return response()->json(['message' => 'Tidak memiliki akses untuk memproses permintaan ini.'], 403);
        }

        $updated = DB::transaction(function () use ($request, $manager, $evaluationReopenRequest) {
            $locked = EvaluationReopenRequest::lockForUpdate()->findOrFail($evaluationReopenRequest->id);
            if ($locked->status !== 'pending') {
                throw ValidationException::withMessages(['decision' => ['Permintaan ini sudah diproses.']]);
            }

            if ($this->evaluationExists($locked->requester_id, $locked->evaluatee_id, $locked->evaluation_period)) {
                $locked->update(['status' => 'completed', 'completed_at' => now()]);
                return $locked->fresh(['requester', 'evaluatee', 'reviewer']);
            }

            $locked->update([
                'status' => $request->decision,
                'reviewed_by' => $manager->username,
                'reviewed_at' => now(),
                'expires_at' => $request->decision === 'approved' ? now()->addHours(24) : null,
                'rejection_reason' => $request->decision === 'rejected' ? trim($request->rejection_reason) : null,
            ]);

            return $locked->fresh(['requester', 'evaluatee', 'reviewer']);
        });

        if ($updated->status === 'completed') {
            throw ValidationException::withMessages(['decision' => ['Evaluasi periode ini sudah selesai.']]);
        }

        $approved = $updated->status === 'approved';
        $notifications->createAndPush(
            $updated->requester_id,
            $approved ? 'evaluation_reopen_approved' : 'evaluation_reopen_rejected',
            $approved ? 'Perpanjangan Evaluasi Disetujui' : 'Perpanjangan Evaluasi Ditolak',
            $approved
                ? 'Evaluasi untuk ' . optional($updated->evaluatee)->name . ' dibuka selama 24 jam.'
                : 'Permintaan perpanjangan evaluasi ditolak: ' . $updated->rejection_reason,
            null,
            ['request_id' => $updated->id, 'url' => '/', 'tag' => 'evaluation-reopen-review-' . $updated->id]
        );

        return response()->json(['message' => $approved ? 'Perpanjangan disetujui selama 24 jam.' : 'Permintaan ditolak.', 'request' => $this->serialize($updated)]);
    }

    private function isActiveLeaderOf(User $leader, User $subordinate): bool
    {
        return $leader->subordinateLines()
            ->where('subordinate_id', $subordinate->username)
            ->where('status', 'active')
            ->exists();
    }

    private function managerOwnsRequest(User $manager, EvaluationReopenRequest $request): bool
    {
        return $this->managerScope->canAccessSupervisor($manager, $request->requester_id);
    }

    private function evaluationExists(string $evaluatorId, string $evaluateeId, $period): bool
    {
        return MonthlyPersonalityEvaluation::where('evaluator_id', $evaluatorId)
            ->where('evaluatee_id', $evaluateeId)
            ->where('evaluation_type', 'personality')
            ->whereDate('evaluation_period', Carbon::parse($period)->startOfMonth()->toDateString())
            ->exists();
    }

    private function expireElapsedApprovals($query): void
    {
        $query->where('status', 'approved')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired', 'updated_at' => now()]);
    }

    private function serialize(EvaluationReopenRequest $request): array
    {
        return [
            'id' => $request->id,
            'requester' => $request->requester ? ['id' => $request->requester->username, 'name' => $request->requester->name] : null,
            'evaluatee' => $request->evaluatee ? ['id' => $request->evaluatee->username, 'name' => $request->evaluatee->name] : null,
            'evaluation_period' => optional($request->evaluation_period)->toDateString(),
            'attempt' => $request->attempt,
            'status' => $request->status,
            'reason' => $request->reason,
            'reviewer' => $request->reviewer ? ['id' => $request->reviewer->username, 'name' => $request->reviewer->name] : null,
            'rejection_reason' => $request->rejection_reason,
            'expires_at' => optional($request->expires_at)->toIso8601String(),
            'created_at' => optional($request->created_at)->toIso8601String(),
        ];
    }
}
