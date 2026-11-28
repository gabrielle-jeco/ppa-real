<?php

namespace App\Http\Controllers;

use App\Models\EvaluationMaster;
use App\Models\EvaluationReopenRequest;
use App\Models\MonthlyPersonalityEvaluation;
use App\Models\User;
use App\Services\ScoringService;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class EvaluationController extends Controller
{
    private const MANAGER_REVIEW_CRITERIA = [
        'direction_execution',
        'crew_follow_up',
        'assignment_quality',
    ];

    private const FALLBACK_PERSONALITY_CRITERIA = [
        'self_development',
        'teamwork',
    ];

    public function store(Request $request)
    {
        try {
            $request->validate([
                'user_id' => 'required|exists:users,username',
                'scores' => 'required|array|min:1|max:100',
                'scores.*' => 'required|integer|min:1|max:5',
                'total_score' => 'nullable|numeric|min:0|max:100',
                'date' => 'required|date_format:Y-m-d',
                'notes' => 'nullable|string|max:5000'
            ]);

            $evaluator = Auth::user();
            $evaluatee = User::where('username', $request->user_id)->firstOrFail();

            if (!in_array($evaluator->role_type, ['manager', 'supervisor'], true)) {
                return response()->json(['error' => 'Tidak memiliki akses. Hanya atasan yang dapat melakukan evaluasi.'], 403);
            }

            if (!$this->canEvaluate($evaluator, $evaluatee)) {
                return response()->json(['error' => 'Tidak memiliki akses. Anda hanya dapat mengevaluasi bawahan Anda.'], 403);
            }

            $evaluationType = $this->resolveEvaluationType($evaluator, $evaluatee);
            $expectedKeys = $this->resolveExpectedCriteriaKeys($evaluationType);
            $submittedScores = $request->input('scores', []);
            $missingKeys = array_diff($expectedKeys, array_keys($submittedScores));
            $unexpectedKeys = array_diff(array_keys($submittedScores), $expectedKeys);
            if ($missingKeys !== [] || $unexpectedKeys !== []) {
                throw ValidationException::withMessages([
                    'scores' => ['Kriteria evaluasi tidak lengkap atau tidak valid.'],
                ]);
            }

            $period = Carbon::parse($request->date)->startOfMonth();
            $targetPeriod = $this->evaluationTargetPeriod($evaluationType);

            if (!$this->isSamePeriod($period, $targetPeriod)) {
                return response()->json([
                    'error' => $this->periodLockedMessage($evaluationType)
                ], 422);
            }

            $normalWindowOpen = $this->isEvaluationWindowOpen($evaluationType);
            if (!$normalWindowOpen && !$this->hasActiveReopenRequest($evaluator, $evaluatee, $period, $evaluationType)) {
                return response()->json([
                    'error' => $this->windowLockedMessage($evaluationType)
                ], 422);
            }

            $normalizedScores = [];
            foreach ($expectedKeys as $key) {
                $normalizedScores[$key] = (int) $submittedScores[$key];
            }
            $totalScore = round((array_sum($normalizedScores) / count($normalizedScores)) * 20, 2);

            $evaluation = DB::transaction(function () use ($request, $evaluator, $evaluatee, $period, $evaluationType, $normalWindowOpen, $normalizedScores, $totalScore) {
                $extension = null;
                if (!$normalWindowOpen) {
                    $extension = EvaluationReopenRequest::where('requester_id', $evaluator->username)
                        ->where('evaluatee_id', $evaluatee->username)
                        ->whereDate('evaluation_period', $period->toDateString())
                        ->where('evaluation_type', $evaluationType)
                        ->where('status', 'approved')
                        ->where('expires_at', '>', now())
                        ->lockForUpdate()
                        ->latest('id')
                        ->first();

                    if (!$extension) {
                        throw ValidationException::withMessages([
                            'date' => ['Perpanjangan evaluasi sudah berakhir atau tidak tersedia.'],
                        ]);
                    }
                }

                $attributes = [
                    'score' => $totalScore,
                    'scores' => $normalizedScores,
                    'notes' => $request->notes,
                ];

                $evaluation = MonthlyPersonalityEvaluation::where('evaluatee_id', $request->user_id)
                    ->where('evaluator_id', $evaluator->username)
                    ->whereDate('evaluation_period', $period->toDateString())
                    ->where('evaluation_type', $evaluationType)
                    ->lockForUpdate()
                    ->first();

                if ($evaluation) {
                    $evaluation->update($attributes);
                } else {
                    $evaluation = MonthlyPersonalityEvaluation::create([
                        'evaluatee_id' => $request->user_id,
                        'evaluator_id' => $evaluator->username,
                        'evaluation_period' => $period->toDateString(),
                        'evaluation_type' => $evaluationType,
                        ...$attributes,
                    ]);
                }

                if ($extension) {
                    $extension->update(['status' => 'completed', 'completed_at' => now()]);
                }

                return $evaluation;
            });

            if ($evaluationType === 'personality' && Schema::hasTable('monthly_overall_scores')) {
                try {
                    app(ScoringService::class)->refreshCrewMonthlySnapshot($evaluatee, $period);
                } catch (\Throwable $snapshotError) {
                    Log::warning('Post-evaluation monthly snapshot refresh failed.', [
                        'evaluatee_id' => $evaluatee->username,
                        'period' => $period->toDateString(),
                        'message' => $snapshotError->getMessage(),
                    ]);
                    report($snapshotError);
                }
            }

            $evaluation->setAttribute('total_score', round((float) $evaluation->score, 2));
            $evaluation->setAttribute('user_id', $evaluation->evaluatee_id);
            $evaluation->setAttribute('date', $evaluation->evaluation_period);

            return response()->json($evaluation);
        } catch (ValidationException $e) {
            throw $e;
        } catch (QueryException $e) {
            if ($this->isEvaluationUniqueConstraintViolation($e)) {
                return response()->json([
                    'error' => 'Evaluasi untuk karyawan dan periode ini baru saja disimpan. Muat ulang halaman untuk melihat data terbaru.',
                    'message' => 'Evaluasi untuk karyawan dan periode ini baru saja disimpan. Muat ulang halaman untuk melihat data terbaru.',
                ], 409);
            }

            Log::error('Evaluation store failed.', [
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Evaluasi belum dapat disimpan. Silakan coba lagi.'
            ], 500);
        } catch (\Throwable $e) {
            Log::error('Evaluation store failed.', [
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Evaluasi belum dapat disimpan. Silakan coba lagi.'
            ], 500);
        }
    }

    private function isEvaluationUniqueConstraintViolation(QueryException $e): bool
    {
        $sqlState = (string) ($e->errorInfo[0] ?? $e->getCode());
        $isUnique = false;

        if ($sqlState === '23505') {
            $isUnique = true;
        } elseif ($sqlState === '23000') {
            $driverCode = (int) ($e->errorInfo[1] ?? 0);
            $isUnique = $driverCode === 1062
                || str_contains($e->getMessage(), 'UNIQUE constraint failed');
        }

        if (!$isUnique) {
            return false;
        }

        $detail = strtolower($e->getMessage() . ' ' . ($e->errorInfo[2] ?? ''));

        return str_contains($detail, 'mpe_unique_eval_period_type_idx')
            || str_contains($detail, 'monthly_personality_evaluations.evaluatee_id');
    }

    public function checkPeriod(Request $request, $supervisorId)
    {
        $request->validate([
            'date' => 'nullable|date_format:Y-m-d',
        ]);

        $evaluator = Auth::user();
        $evaluatee = User::where('username', $supervisorId)->first();

        if (!$evaluatee) {
            return response()->json(['error' => 'Karyawan yang dievaluasi tidak ditemukan.'], 404);
        }

        if (!$this->canEvaluate($evaluator, $evaluatee)) {
            return response()->json(['error' => 'Tidak memiliki akses. Anda hanya dapat melihat evaluasi bawahan Anda.'], 403);
        }

        $evaluationType = $this->resolveEvaluationType($evaluator, $evaluatee);
        $targetPeriod = $this->evaluationTargetPeriod($evaluationType);
        $dateStr = $request->query('date');
        $requestedPeriod = $dateStr
            ? Carbon::parse($dateStr)->startOfMonth()
            : $targetPeriod->copy();

        $evaluation = MonthlyPersonalityEvaluation::where('evaluatee_id', $supervisorId)
            ->where('evaluator_id', $evaluator->username)
            ->where('evaluation_type', $evaluationType)
            ->whereYear('evaluation_period', $requestedPeriod->year)
            ->whereMonth('evaluation_period', $requestedPeriod->month)
            ->first();

        if ($evaluation) {
            $evaluation->setAttribute('total_score', round((float) $evaluation->score, 2));
            $evaluation->setAttribute('user_id', $evaluation->evaluatee_id);
            $evaluation->setAttribute('date', $evaluation->evaluation_period);
        }

        $isTargetPeriod = $this->isSamePeriod($requestedPeriod, $targetPeriod);
        $isWindowOpen = $this->isEvaluationWindowOpen($evaluationType);
        $requestQuery = EvaluationReopenRequest::where('requester_id', $evaluator->username)
            ->where('evaluatee_id', $evaluatee->username)
            ->whereDate('evaluation_period', $requestedPeriod->toDateString())
            ->where('evaluation_type', $evaluationType);

        (clone $requestQuery)->where('status', 'approved')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired', 'updated_at' => now()]);

        $latestRequest = (clone $requestQuery)->latest('attempt')->first();
        $attemptsUsed = (clone $requestQuery)->count();
        $extensionActive = $latestRequest
            && $latestRequest->status === 'approved'
            && $latestRequest->expires_at
            && $latestRequest->expires_at->isFuture();
        $canEvaluate = !$evaluation && $isTargetPeriod && ($isWindowOpen || $extensionActive);
        $canRequestReopen = !$evaluation
            && $evaluationType === 'personality'
            && $isTargetPeriod
            && !$isWindowOpen
            && $attemptsUsed < EvaluationReopenRequest::MAX_ATTEMPTS
            && !($latestRequest && ($latestRequest->status === 'pending' || $extensionActive));
        $lockedMessage = null;

        if (!$isTargetPeriod) {
            $lockedMessage = $this->periodLockedMessage($evaluationType);
        } elseif (!$isWindowOpen && !$extensionActive) {
            $lockedMessage = $this->windowLockedMessage($evaluationType);
        }

        return response()->json([
            'evaluated' => !!$evaluation,
            'can_evaluate' => $canEvaluate,
            'is_locked' => !$canEvaluate,
            'locked_message' => $lockedMessage,
            'evaluation_period' => $requestedPeriod->toDateString(),
            'target_period' => $targetPeriod->toDateString(),
            'evaluation_window_starts_at' => $this->evaluationWindowStart($evaluationType)->toDateString(),
            'evaluation_window_ends_at' => $this->evaluationWindowEnd($evaluationType)->toDateString(),
            'evaluation_type' => $evaluationType,
            'reopen_request' => $latestRequest ? [
                'id' => $latestRequest->id,
                'attempt' => $latestRequest->attempt,
                'status' => $latestRequest->status,
                'reason' => $latestRequest->reason,
                'rejection_reason' => $latestRequest->rejection_reason,
                'expires_at' => optional($latestRequest->expires_at)->toIso8601String(),
            ] : null,
            'reopen_attempts_used' => $attemptsUsed,
            'reopen_attempts_remaining' => max(0, EvaluationReopenRequest::MAX_ATTEMPTS - $attemptsUsed),
            'can_request_reopen' => $canRequestReopen,
            'data' => $evaluation
        ]);
    }

    private function canEvaluate(User $evaluator, User $evaluatee): bool
    {
        if (!in_array($evaluator->role_type, ['manager', 'supervisor'], true)) {
            return false;
        }

        return $evaluator->subordinateLines()
            ->where('subordinate_id', $evaluatee->username)
            ->where('status', 'active')
            ->exists();
    }

    private function resolveEvaluationType(User $evaluator, User $evaluatee): string
    {
        if ($evaluator->role_type === 'manager' && $evaluatee->role_type === 'supervisor') {
            return 'manager_review';
        }

        return 'personality';
    }

    private function resolveExpectedCriteriaKeys(string $evaluationType): array
    {
        if ($evaluationType === 'manager_review') {
            return self::MANAGER_REVIEW_CRITERIA;
        }

        if (Schema::hasTable('evaluation_masters')) {
            $masterIds = EvaluationMaster::where('active', true)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->pluck('id');

            if ($masterIds->isNotEmpty()) {
                return $masterIds->map(fn ($id) => 'evaluation_' . $id)->all();
            }
        }

        return self::FALLBACK_PERSONALITY_CRITERIA;
    }

    private function evaluationTargetPeriod(string $evaluationType): Carbon
    {
        if ($evaluationType === 'personality') {
            return now()->copy()->subMonthNoOverflow()->startOfMonth();
        }

        return now()->copy()->startOfMonth();
    }

    private function isEvaluationWindowOpen(string $evaluationType): bool
    {
        $today = now()->startOfDay();

        return $today->betweenIncluded(
            $this->evaluationWindowStart($evaluationType),
            $this->evaluationWindowEnd($evaluationType)
        );
    }

    private function hasActiveReopenRequest(User $evaluator, User $evaluatee, Carbon $period, string $evaluationType): bool
    {
        if ($evaluationType !== 'personality') {
            return false;
        }

        EvaluationReopenRequest::where('requester_id', $evaluator->username)
            ->where('evaluatee_id', $evaluatee->username)
            ->whereDate('evaluation_period', $period->toDateString())
            ->where('evaluation_type', $evaluationType)
            ->where('status', 'approved')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired', 'updated_at' => now()]);

        return EvaluationReopenRequest::where('requester_id', $evaluator->username)
            ->where('evaluatee_id', $evaluatee->username)
            ->whereDate('evaluation_period', $period->toDateString())
            ->where('evaluation_type', $evaluationType)
            ->where('status', 'approved')
            ->where('expires_at', '>', now())
            ->exists();
    }

    private function evaluationWindowStart(string $evaluationType): Carbon
    {
        if ($evaluationType === 'personality') {
            return now()->copy()->startOfMonth()->startOfDay();
        }

        return now()->copy()->endOfMonth()->subDays(6)->startOfDay();
    }

    private function evaluationWindowEnd(string $evaluationType): Carbon
    {
        if ($evaluationType === 'personality') {
            return now()->copy()->startOfMonth()->addDays(5)->endOfDay();
        }

        return now()->copy()->endOfMonth()->endOfDay();
    }

    private function isSamePeriod(Carbon $period, Carbon $targetPeriod): bool
    {
        return $period->year === $targetPeriod->year && $period->month === $targetPeriod->month;
    }

    private function periodLockedMessage(string $evaluationType): string
    {
        if ($evaluationType === 'personality') {
            return 'Evaluasi hanya bisa diisi untuk bulan sebelumnya.';
        }

        return 'Evaluasi hanya bisa diisi untuk bulan berjalan.';
    }

    private function windowLockedMessage(string $evaluationType): string
    {
        if ($evaluationType === 'personality') {
            return 'Evaluasi bulan sebelumnya hanya dapat diisi pada tanggal 1-6 bulan berjalan.';
        }

        return 'Evaluasi bulanan baru bisa diisi pada 7 hari terakhir bulan berjalan.';
    }
}
