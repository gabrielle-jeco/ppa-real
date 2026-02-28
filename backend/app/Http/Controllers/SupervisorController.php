<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

class SupervisorController extends Controller
{
    /**
     * Get list of Crews under this Supervisor.
     * Logic: Crews in the same location (since Supervisor location is locked).
     */
    public function index(Request $request)
    {
        $user = Auth::user();

        // Security Check
        if ($user->role_type !== 'supervisor') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Fetch Crews via Reporting Lines relation
        $subordinates = $user->subordinateLines()->with('subordinate.locations')->get();
        $crews = $subordinates->pluck('subordinate')->filter(function ($crew) {
            return $crew && $crew->active;
        })
            ->values()
            ->map(function ($crew) {
                $score = rand(60, 98); // Dummy score for demo
                return [
                    'id' => $crew->user_id,
                    'name' => $crew->full_name,
                    'role' => $crew->role_type, // 'Crew' (maybe specific role later)
                    'location' => $crew->locations->first() ? $crew->locations->first()->name : 'N/A',
                    'status' => 'active',
                    'score' => $score,
                    'activity_percentage' => $score,
                    'task_progress' => rand(50, 100),
                    'is_top_performer' => $score > 90
                ];
            });

        // Calculate Average for the Location/Group
        $avgScore = $crews->avg('score');

        return response()->json([
            'supervisor' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => 'Supervisor',
                'location' => $user->locations->first() ? $user->locations->first()->name : 'Unknown',
            ],
            'location_name' => $user->locations->first() ? $user->locations->first()->name : 'All Locations',
            'location_avg_progress' => round($crews->avg('task_progress'), 1),
            'crews' => $crews
        ]);
    }

    /**
     * Get Supervisor's OWN Performance Stats.
     * Mocking data based on 'Penilaian Supervisor' mockup.
     */
    public function myStats(Request $request)
    {
        $user = Auth::user();

        // In real app, fetch from evaluations table where user_id = auth user.
        // For now, return Mock Data matching the UI.

        return response()->json([
            'my_avg_point' => 81,
            'task_for_sc' => [
                'completed' => 70,
                'total' => 100, // 70%
                'label' => 'Task for SC'
            ],
            'task_from_manager' => [
                'completed' => 35,
                'total' => 100, // 35%
                'label' => 'Task Completed From SM/RM'
            ],
            'monthly_task_given' => '168/8 People', // Mock
            'avg_service_crew_point' => 70 // Mock
        ]);
    }
}
