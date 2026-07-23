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
            'work_station_name' => 'required|string|max:255',
            'is_initial_login' => 'boolean|nullable',
            'force_log' => 'boolean|nullable'
        ]);

        $user = Auth::user();

        $workStation = WorkStation::where('active', true)
            ->whereRaw('LOWER(TRIM(name)) = ?', [strtolower(trim($request->work_station_name))])
            ->first();

        if (!$workStation) {
            return response()->json(['message' => 'Nama work station tidak valid.'], 400);
        }

        if ($request->is_initial_login && !$request->force_log) {
            $existingLog = ActivityLog::where('user_id', $user->username)
                ->where('work_station_id', $workStation->id)
                ->where('action', 'station_changed')
                ->whereDate('created_at', now()->toDateString())
                ->first();

            if ($existingLog) {
                return response()->json([
                    'message' => 'Work station awal sudah tercatat hari ini.',
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
            'message' => 'Perubahan work station berhasil dicatat.',
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
        $request->validate([
            'user_id' => 'nullable|string|max:255',
            'date' => 'nullable|date_format:Y-m-d',
        ]);

        $authUser = Auth::user();
        $targetUserId = $request->query('user_id', $authUser->username);

        $user = User::where('username', $targetUserId)->first();
        if (!$user) {
            return response()->json(['message' => 'User tidak ditemukan.'], 404);
        }

        if ($authUser->username !== $user->username) {
            if ($authUser->role_type !== 'supervisor' && $authUser->role_type !== 'manager') {
                return response()->json(['message' => 'Tidak memiliki akses.'], 403);
            }

            $isSubordinate = $authUser->subordinateLines()->where('subordinate_id', $user->username)->where('status', 'active')->exists();
            if (!$isSubordinate) {
                return response()->json(['message' => 'Tidak memiliki akses. User ini bukan bawahan Anda.'], 403);
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
                    'role' => $log->workStation ? $log->workStation->name : 'Tidak diketahui',
                    'time' => $log->created_at->format('H:i'),
                    'action' => $log->action
                ];
            });

        return response()->json($logs);
    }
}
