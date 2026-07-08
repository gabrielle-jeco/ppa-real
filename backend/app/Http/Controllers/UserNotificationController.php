<?php

namespace App\Http\Controllers;

use App\Models\UserNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UserNotificationController extends Controller
{
    public function index()
    {
        $user = Auth::user();

        $notifications = UserNotification::where('recipient_id', $user->username)
            ->latest()
            ->limit(25)
            ->get()
            ->map(fn ($notification) => [
                'id' => $notification->id,
                'type' => $notification->type,
                'title' => $notification->title,
                'message' => $notification->message,
                'description' => $notification->description,
                'data' => $notification->data,
                'read_at' => optional($notification->read_at)->toDateTimeString(),
                'created_at' => optional($notification->created_at)->toDateTimeString(),
                'unread' => $notification->read_at === null,
            ]);

        return response()->json([
            'notifications' => $notifications,
            'unread_count' => $notifications->where('unread', true)->count(),
        ]);
    }

    public function markRead(UserNotification $notification)
    {
        $user = Auth::user();
        if ($notification->recipient_id !== $user->username) {
            return response()->json(['message' => 'Tidak memiliki akses.'], 403);
        }

        $notification->update(['read_at' => now()]);

        return response()->json(['message' => 'Notifikasi ditandai sudah dibaca.']);
    }

    public function markAllRead()
    {
        $user = Auth::user();

        UserNotification::where('recipient_id', $user->username)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['message' => 'Semua notifikasi ditandai sudah dibaca.']);
    }
}
