<?php

namespace App\Http\Controllers;

use App\Models\MonthlyPersonalityEvaluation;
use App\Models\User;
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

            $date = \Carbon\Carbon::parse($request->date)->startOfMonth()->format('Y-m-d');

            $evaluation = MonthlyPersonalityEvaluation::updateOrCreate(
                [
                    'evaluatee_id' => $request->user_id,
                    'evaluation_period' => $date,
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
        $date = \Carbon\Carbon::parse($dateStr);

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
            'data' => $evaluation
        ]);
    }
}
