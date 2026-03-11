<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\ActivityLog;
use App\Models\WorkStation;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

class ActivityController extends Controller
{
    /**
     * Record a crew's workstation change.
     * Route: POST /api/crew/activity
     */
    public function logStationChange(Request $request)
    {
        $request->validate([
            'work_station_name' => 'required|string',
            'is_initial_login' => 'boolean|nullable',
            'force_log' => 'boolean|nullable'
        ]);

        $user = Auth::user();

        // Find the workstation by name (e.g., 'cashier', 'fresh')
        $workStation = WorkStation::where('name', $request->work_station_name)->first();

        if (!$workStation) {
            return response()->json(['message' => 'Invalid workstation name'], 400);
        }

        // If it's an initial login (page refresh), check if a log already exists for this station today
        if ($request->is_initial_login && !$request->force_log) {
            $existingLog = ActivityLog::where('user_id', $user->id)
                ->where('work_station_id', $workStation->id)
                ->where('action', 'station_changed') // Could also be 'initial_login' but keeping it consistent
                ->whereDate('created_at', now()->toDateString())
                ->first();

            if ($existingLog) {
                // Already logged in to this station today, ignore
                return response()->json([
                    'message' => 'Initial workstation already logged today',
                    'work_station' => $workStation,
                    'is_duplicate' => true
                ], 200);
            }
        }

        // Log the activity (initial_login is safely aliased to station_changed)
        $log = ActivityLog::create([
            'user_id' => $user->id,
            'work_station_id' => $workStation->id,
            'action' => 'station_changed'
        ]);

        return response()->json([
            'message' => 'Workstation changed successfully',
            'activity_log' => $log,
            'work_station' => $workStation
        ], 201);
    }

    /**
     * Get all workstations and their guides.
     * Route: GET /api/work-stations
     */
    public function getWorkStations()
    {
        $stations = WorkStation::all();
        return response()->json($stations);
    }

    /**
     * Get user's activity logs.
     * Route: GET /api/crew/activity-logs
     */
    public function getLogs(Request $request)
    {
        $authUser = Auth::user();
        $targetUserId = $request->query('user_id', $authUser->id);

        $user = User::find($targetUserId);
        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        // Authorization logic
        if ($authUser->id != $user->id) {
            // Must be superior to view other's activity logs
            if ($authUser->role_type !== 'supervisor' && $authUser->role_type !== 'manager') {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            // Hierarchy Check: The superior must be the direct manager/supervisor of the user
            $isSubordinate = $authUser->subordinateLines()->where('subordinate_id', $user->id)->where('status', 'active')->exists();
            if (!$isSubordinate) {
                return response()->json(['message' => 'Unauthorized. This user is not your subordinate.'], 403);
            }
        }

        $dateStr = $request->query('date', now()->toDateString());

        $logs = ActivityLog::with('workStation')
            ->where('user_id', $user->id)
            ->whereDate('created_at', $dateStr)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($log) {
                return [
                    'id' => $log->id,
                    'type' => 'role_change',
                    'role' => $log->workStation ? $log->workStation->name : 'Unknown',
                    'time' => $log->created_at->format('H:i'),
                    'action' => $log->action
                ];
            });

        return response()->json($logs);
    }
}
