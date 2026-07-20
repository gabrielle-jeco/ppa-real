<?php

namespace App\Services;

use App\Models\UserNotification;
use Illuminate\Support\Facades\Log;

class UserNotificationService
{
    public function createAndPush(
        string $recipientId,
        string $type,
        string $title,
        string $message,
        ?string $description = null,
        array $data = [],
        ?string $dedupeKey = null
    ): ?UserNotification
    {
        $attributes = [
            'recipient_id' => $recipientId,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'description' => $description,
            'data' => $data,
        ];

        try {
            if ($dedupeKey) {
                $notification = UserNotification::firstOrCreate(
                    ['recipient_id' => $recipientId, 'dedupe_key' => $dedupeKey],
                    $attributes
                );

                if (!$notification->wasRecentlyCreated) {
                    return $notification;
                }
            } else {
                $notification = UserNotification::create($attributes);
            }
        } catch (\Throwable $error) {
            Log::error('Notification persistence failed.', [
                'recipient_id' => $recipientId,
                'type' => $type,
                'dedupe_key' => $dedupeKey,
                'message' => $error->getMessage(),
            ]);

            return null;
        }

        try {
            app(WebPushService::class)->sendToUsers(
                [$recipientId],
                $title,
                $message,
                [
                    'url' => $data['url'] ?? '/',
                    'tag' => $data['tag'] ?? "notification-{$notification->id}",
                ]
            );
        } catch (\Throwable $error) {
            Log::warning('Web Push delivery failed.', [
                'notification_id' => $notification->id,
                'recipient_id' => $recipientId,
                'message' => $error->getMessage(),
            ]);
        }

        return $notification;
    }
}
