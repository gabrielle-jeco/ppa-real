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
                'scores' => 'required|array',
                'total_score' => 'required|numeric',
                'date' => 'required|date',
                'notes' => 'nullable|string'
            ]);

            $evaluator = Auth::user();
            $evaluatee = User::where('username', $request->user_id)->firstOrFail();

            if (!in_array($evaluator->role_type, ['manager', 'supervisor'], true)) {
                return response()->json(['error' => 'Tidak memiliki akses. Hanya atasan yang dapat melakukan evaluasi.'], 403);
            }

            if (!$this->canEvaluate($evaluator, $evaluatee)) {
                return response()->json(['error' => 'Tidak memiliki akses. Anda hanya dapat mengevaluasi bawahan Anda.'], 403);
            }

            $period = Carbon::parse($request->date)->startOfMonth();
            $currentPeriod = now()->startOfMonth();

            if (!$period->isSameMonth($currentPeriod) || !$period->isSameYear($currentPeriod)) {
                return response()->json([
                    'error' => 'Evaluasi hanya bisa diisi untuk bulan berjalan.'
                ], 422);
            }

            if (!$this->isEvaluationWindowOpen()) {
                return response()->json([
                    'error' => 'Evaluasi bulanan baru bisa diisi pada 7 hari terakhir bulan berjalan.'
                ], 422);
            }

            $evaluationType = $this->resolveEvaluationType($evaluator, $evaluatee);

            $evaluation = MonthlyPersonalityEvaluation::updateOrCreate(
                [
                    'evaluatee_id' => $request->user_id,
                    'evaluator_id' => $evaluator->username,
                    'evaluation_period' => $period->toDateString(),
                    'evaluation_type' => $evaluationType,
                ],
                [
                    'score' => $request->total_score,
                    'scores' => $request->scores,
                    'notes' => $request->notes,
                ]
            );

            $evaluation->setAttribute('total_score', $evaluation->score);
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
        $dateStr = $request->query('date', now()->format('Y-m-d'));
        $date = Carbon::parse($dateStr);
        $currentPeriod = now()->startOfMonth();
        $requestedPeriod = $date->copy()->startOfMonth();

        $evaluator = Auth::user();
        $evaluatee = User::where('username', $supervisorId)->first();

        if (!$evaluatee) {
            return response()->json(['error' => 'Karyawan yang dievaluasi tidak ditemukan.'], 404);
        }

        if (!$this->canEvaluate($evaluator, $evaluatee)) {
            return response()->json(['error' => 'Tidak memiliki akses. Anda hanya dapat melihat evaluasi bawahan Anda.'], 403);
        }

        $evaluationType = $this->resolveEvaluationType($evaluator, $evaluatee);

        $evaluation = MonthlyPersonalityEvaluation::where('evaluatee_id', $supervisorId)
            ->where('evaluator_id', $evaluator->username)
            ->where('evaluation_type', $evaluationType)
            ->whereYear('evaluation_period', $date->year)
            ->whereMonth('evaluation_period', $date->month)
            ->first();

        if ($evaluation) {
            $evaluation->setAttribute('total_score', $evaluation->score);
            $evaluation->setAttribute('user_id', $evaluation->evaluatee_id);
            $evaluation->setAttribute('date', $evaluation->evaluation_period);
        }

        $isCurrentPeriod = $requestedPeriod->equalTo($currentPeriod);
        $isWindowOpen = $this->isEvaluationWindowOpen();
        $canEvaluate = $isCurrentPeriod && $isWindowOpen;
        $lockedMessage = null;

        if (!$isCurrentPeriod) {
            $lockedMessage = 'Evaluasi hanya bisa diisi untuk bulan berjalan.';
        } elseif (!$isWindowOpen) {
            $lockedMessage = 'Evaluasi bulanan baru dibuka pada 7 hari terakhir bulan ini.';
        }

        return response()->json([
            'evaluated' => !!$evaluation,
            'can_evaluate' => $canEvaluate,
            'is_locked' => !$canEvaluate,
            'locked_message' => $lockedMessage,
            'evaluation_window_starts_at' => $this->evaluationWindowStart()->toDateString(),
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

    private function isEvaluationWindowOpen(): bool
    {
        return now()->startOfDay()->greaterThanOrEqualTo($this->evaluationWindowStart());
    }

    private function evaluationWindowStart(): Carbon
    {
        return now()->copy()->endOfMonth()->subDays(6)->startOfDay();
    }
}
