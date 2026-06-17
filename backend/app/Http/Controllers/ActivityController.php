<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\ActivityLog;
use App\Models\WorkStation;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

class ActivityController extends Controller
{
    public function logStationChange(Request $request)
    {
        $request->validate([
            'work_station_name' => 'required|string',
            'is_initial_login' => 'boolean|nullable',
            'force_log' => 'boolean|nullable'
        ]);

        $user = Auth::user();

        $workStation = WorkStation::where('active', true)
            ->whereRaw('LOWER(TRIM(name)) = ?', [strtolower(trim($request->work_station_name))])
            ->first();

        if (!$workStation) {
            return response()->json(['message' => 'Invalid workstation name'], 400);
        }

        if ($request->is_initial_login && !$request->force_log) {
            $existingLog = ActivityLog::where('user_id', $user->username)
                ->where('work_station_id', $workStation->id)
                ->where('action', 'station_changed')
                ->whereDate('created_at', now()->toDateString())
                ->first();

            if ($existingLog) {
                return response()->json([
                    'message' => 'Initial workstation already logged today',
                    'work_station' => $workStation,
                    'is_duplicate' => true
                ], 200);
            }
        }

        $log = ActivityLog::create([
            'user_id' => $user->username,
            'work_station_id' => $workStation->id,
            'action' => 'station_changed'
        ]);

        return response()->json([
            'message' => 'Workstation changed successfully',
            'activity_log' => $log,
            'work_station' => $workStation
        ], 201);
    }

    public function getWorkStations()
    {
        $stations = WorkStation::where('active', true)->orderBy('name')->get();
        return response()->json($stations);
    }

    public function getLogs(Request $request)
    {
        $authUser = Auth::user();
        $targetUserId = $request->query('user_id', $authUser->username);

        $user = User::where('username', $targetUserId)->first();
        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        if ($authUser->username !== $user->username) {
            if ($authUser->role_type !== 'supervisor' && $authUser->role_type !== 'manager') {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $isSubordinate = $authUser->subordinateLines()->where('subordinate_id', $user->username)->where('status', 'active')->exists();
            if (!$isSubordinate) {
                return response()->json(['message' => 'Unauthorized. This user is not your subordinate.'], 403);
            }
        }

        $dateStr = $request->query('date', now()->toDateString());

        $logs = ActivityLog::with('workStation')
            ->where('user_id', $user->username)
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
