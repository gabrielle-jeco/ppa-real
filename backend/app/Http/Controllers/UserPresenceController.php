<?php

namespace App\Http\Controllers;

use App\Models\UserPresence;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UserPresenceController extends Controller
{
    public function heartbeat(Request $request)
    {
        $data = $request->validate([
            'device_key' => ['nullable', 'string', 'max:64'],
            'last_url' => ['nullable', 'string', 'max:1000'],
            'device_type' => ['nullable', 'string', 'max:50'],
        ]);

        $user = Auth::user();
        $deviceKey = $data['device_key'] ?? 'default';

        UserPresence::updateOrCreate(
            [
                'user_id' => $user->username,
                'device_key' => $deviceKey,
            ],
            [
                'last_seen_at' => now(),
                'last_url' => $data['last_url'] ?? null,
                'device_type' => $data['device_type'] ?? null,
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 1000),
            ]
        );

        return response()->json(['message' => 'Aktivitas user berhasil diperbarui.']);
    }
}
