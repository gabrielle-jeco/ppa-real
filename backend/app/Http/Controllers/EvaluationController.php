<?php

namespace App\Http\Controllers;

use App\Models\MonthlyPersonalityEvaluation;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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

            // Security Check: Only managers and supervisors can evaluate
            if ($evaluator->role_type !== 'manager' && $evaluator->role_type !== 'supervisor') {
                return response()->json(['error' => 'Unauthorized. Only superiors can evaluate.'], 403);
            }

            // Hierarchy Check: Ensure the target user is a subordinate
            $isSubordinate = $evaluator->subordinateLines()->where('subordinate_id', $request->user_id)->where('status', 'active')->exists();
            if (!$isSubordinate) {
                return response()->json(['error' => 'Unauthorized. You can only evaluate your direct subordinates.'], 403);
            }

            $period = Carbon::parse($request->date)->startOfMonth();
            $currentPeriod = now()->startOfMonth();

            if (!$period->isSameMonth($currentPeriod) || !$period->isSameYear($currentPeriod)) {
                return response()->json([
                    'error' => 'Evaluation can only be submitted for the current month.'
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

            // Frontend compatibility response
            $evaluation->setAttribute('total_score', $evaluation->score);
            $evaluation->setAttribute('user_id', $evaluation->evaluatee_id);
            $evaluation->setAttribute('date', $evaluation->evaluation_period);

            return response()->json($evaluation);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Evaluation Store Error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
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
        $evaluationType = $evaluatee ? $this->resolveEvaluationType($evaluator, $evaluatee) : 'personality';

        $evaluation = MonthlyPersonalityEvaluation::where('evaluatee_id', $supervisorId)
            ->where('evaluation_type', $evaluationType)
            ->whereYear('evaluation_period', $date->year)
            ->whereMonth('evaluation_period', $date->month)
            ->first();

        if ($evaluation) {
            $evaluation->setAttribute('total_score', $evaluation->score);
            $evaluation->setAttribute('user_id', $evaluation->evaluatee_id);
            $evaluation->setAttribute('date', $evaluation->evaluation_period);
        }

        // Safe response
        return response()->json([
            'evaluated' => !!$evaluation,
            'can_evaluate' => $requestedPeriod->equalTo($currentPeriod),
            'is_locked' => !$requestedPeriod->equalTo($currentPeriod),
            'evaluation_type' => $evaluationType,
            'data' => $evaluation
        ]);
    }

    private function resolveEvaluationType(User $evaluator, User $evaluatee): string
    {
        if ($evaluator->role_type === 'manager' && $evaluatee->role_type === 'supervisor') {
            return 'manager_review';
        }

        return 'personality';
    }
}
