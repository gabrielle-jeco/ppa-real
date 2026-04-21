<?php

namespace App\Http\Controllers;

use App\Models\MonthlyPersonalityEvaluation;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class EvaluationController extends Controller
{
    public function store(Request $request)
    {
        try {
            $request->validate([
                'user_id' => 'required|exists:users,id',
                'scores' => 'required|array',
                'total_score' => 'required|numeric',
                'date' => 'required|date',
                'notes' => 'nullable|string'
            ]);

            $evaluator = Auth::user();

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

            $evaluation = MonthlyPersonalityEvaluation::updateOrCreate(
                [
                    'evaluatee_id' => $request->user_id,
                    'evaluation_period' => $period->toDateString(),
                ],
                [
                    'evaluator_id' => Auth::id(),
                    'score' => $request->total_score,
                ]
            );

            // Frontend compatibility response
            $evaluation->setAttribute('total_score', $evaluation->score);
            $evaluation->setAttribute('user_id', $evaluation->evaluatee_id);
            $evaluation->setAttribute('date', $evaluation->evaluation_period);
            $evaluation->setAttribute('scores', $request->scores);
            $evaluation->setAttribute('notes', $request->notes);

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

        $evaluation = MonthlyPersonalityEvaluation::where('evaluatee_id', $supervisorId)
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
            'data' => $evaluation
        ]);
    }
}
