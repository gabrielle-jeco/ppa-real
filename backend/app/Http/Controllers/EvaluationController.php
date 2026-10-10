<?php

namespace App\Http\Controllers;

use App\Models\MonthlyPersonalityEvaluation;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class EvaluationController extends Controller
{
    public function store(Request $request)
    {
        try {
            $request->validate([
                'user_id' => 'required|exists:users,username',
                'scores' => 'required|array|min:1|max:100',
                'scores.*' => 'required|numeric|min:1|max:100',
                'total_score' => 'required|numeric|min:0|max:100',
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
            $period = Carbon::parse($request->date)->startOfMonth();
            $targetPeriod = $this->evaluationTargetPeriod($evaluationType);

            if (!$this->isSamePeriod($period, $targetPeriod)) {
                return response()->json([
                    'error' => $this->periodLockedMessage($evaluationType)
                ], 422);
            }

            if (!$this->isEvaluationWindowOpen($evaluationType)) {
                return response()->json([
                    'error' => $this->windowLockedMessage($evaluationType)
                ], 422);
            }

            $totalScore = round((float) $request->total_score, 2);

            $evaluation = MonthlyPersonalityEvaluation::updateOrCreate(
                [
                    'evaluatee_id' => $request->user_id,
                    'evaluator_id' => $evaluator->username,
                    'evaluation_period' => $period->toDateString(),
                    'evaluation_type' => $evaluationType,
                ],
                [
                    'score' => $totalScore,
                    'scores' => $request->scores,
                    'notes' => $request->notes,
                ]
            );

            $evaluation->setAttribute('total_score', round((float) $evaluation->score, 2));
            $evaluation->setAttribute('user_id', $evaluation->evaluatee_id);
            $evaluation->setAttribute('date', $evaluation->evaluation_period);

            return response()->json($evaluation);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Evaluation store failed.', [
                'message' => $e->getMessage(),
            ]);

            return response()->json([
                'error' => 'Evaluasi belum dapat disimpan. Silakan coba lagi.'
            ], 500);
        }
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
        $canEvaluate = $isTargetPeriod && $isWindowOpen;
        $lockedMessage = null;

        if (!$isTargetPeriod) {
            $lockedMessage = $this->periodLockedMessage($evaluationType);
        } elseif (!$isWindowOpen) {
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
