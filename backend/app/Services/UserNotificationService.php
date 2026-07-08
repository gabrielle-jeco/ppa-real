<?php

namespace App\Services;

use App\Models\UserNotification;

class UserNotificationService
{
    public function createAndPush(string $recipientId, string $type, string $title, string $message, ?string $description = null, array $data = []): UserNotification
    {
        $notification = UserNotification::create([
            'recipient_id' => $recipientId,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'description' => $description,
            'data' => $data,
        ]);

        app(WebPushService::class)->sendToUsers(
            [$recipientId],
            $title,
            $message,
            [
                'url' => $data['url'] ?? '/',
                'tag' => $data['tag'] ?? "notification-{$notification->id}",
            ]
        );

        return $notification;
    }
}
