<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

class ManagerController extends Controller
{
    /**
     * Get list of supervisors for the logged-in manager.
     */
    public function getSupervisors(Request $request)
    {
        $user = Auth::user();

        // Security Check: Must be a manager
        if ($user->role_type !== 'manager') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Fetch Supervisors through Reporting Lines
        $supervisorsCollection = $user->subordinateLines()->with(['subordinate.locations'])->get()
            ->pluck('subordinate')
            ->filter(function ($spv) {
                return $spv && $spv->active;
            });

        $locations = $user->locations->map(function ($loc) {
            return ['id' => $loc->id, 'name' => $loc->name];
        });

        $filterLocationName = 'All Locations';

        // LOGIC: Filter by Location
        if ($user->manager_type === 'SM') {
            $smLocationId = $user->locations->first() ? $user->locations->first()->id : null;
            $filterLocationName = $user->locations->first() ? $user->locations->first()->name : 'Unknown Location';

            if ($smLocationId) {
                $supervisorsCollection = $supervisorsCollection->filter(function ($spv) use ($smLocationId) {
                    return $spv->locations->contains('id', $smLocationId);
                });
            }
        } else {
            // Regional Manager: Can filter by specific location dropdown
            if ($request->has('location_id') && $request->location_id) {
                $supervisorsCollection = $supervisorsCollection->filter(function ($spv) use ($request) {
                    return $spv->locations->contains('id', $request->location_id);
                });

                $loc = $user->locations->firstWhere('id', $request->location_id);
                $filterLocationName = $loc ? $loc->name : 'Unknown Location';
            }
        }

        $supervisors = $supervisorsCollection->values()->map(function ($spv) {
            // Randomize data for demo purposes to match the "Traffic Light" requirement
            $score = rand(60, 98);

            return [
                'id' => $spv->id,
                'name' => $spv->name,
                'role' => 'Supervisor',
                'location' => $spv->locations->first() ? $spv->locations->first()->name : 'N/A',
                'status' => $spv->active ? 'active' : 'inactive',
                'score' => $score,
                'activity_percentage' => $score, // Mapping score to activity % for now
                'task_progress' => rand(50, 100), // Different metric for the thin progress bar
                'is_top_performer' => $score > 95 // Logic for the Star icon
            ];
        });

        // Calculate Average for the Location (or filtered set)
        $avgScore = $supervisors->avg('score');

        return response()->json([
            'manager' => [
                'name' => $user->name,
                'role' => $user->role_type === 'manager' ? ($user->manager_type === 'SM' ? 'Store Manager' : 'Regional Manager') : 'Manager',
                'type' => $user->manager_type // identifying RM vs SM on frontend
            ],
            'location_name' => $filterLocationName,
            'locations' => $locations, // List for dropdown
            'location_avg_progress' => round($supervisors->avg('task_progress'), 1),
            'supervisors' => $supervisors
        ]);
    }
}
