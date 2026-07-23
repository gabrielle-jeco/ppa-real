<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class PushSubscriptionController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'endpoint' => 'required|url|max:2048',
            'keys.p256dh' => 'required|string|max:512',
            'keys.auth' => 'required|string|max:255',
            'contentEncoding' => 'nullable|string|in:aes128gcm,aesgcm',
        ]);

        $subscription = PushSubscription::updateOrCreate(
            ['endpoint' => $data['endpoint']],
            [
                'user_id' => Auth::user()->username,
                'public_key' => $data['keys']['p256dh'],
                'auth_token' => $data['keys']['auth'],
                'content_encoding' => $data['contentEncoding'] ?? 'aes128gcm',
                'user_agent' => substr((string) $request->userAgent(), 0, 1000),
                'last_used_at' => now(),
            ]
        );

        return response()->json(['message' => 'Langganan notifikasi berhasil disimpan.', 'id' => $subscription->id]);
    }
}
