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

        $this->push($notification, $recipientId, $title, $message, $data);

        return $notification;
    }

    public function createOrRefreshAggregateAndPush(
        string $recipientId,
        string $dedupeKey,
        string $type,
        string $title,
        string $message,
        ?string $description = null,
        array $data = []
    ): ?UserNotification {
        $attributes = [
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'description' => $description,
            'data' => $data,
        ];

        try {
            $notification = UserNotification::firstOrCreate(
                ['recipient_id' => $recipientId, 'dedupe_key' => $dedupeKey],
                [...$attributes, 'read_at' => null]
            );
            $shouldPush = $notification->wasRecentlyCreated || $notification->read_at !== null;

            if (!$notification->wasRecentlyCreated) {
                $notification->fill([...$attributes, 'read_at' => null])->save();
            }
        } catch (\Throwable $error) {
            Log::error('Aggregate notification persistence failed.', [
                'recipient_id' => $recipientId,
                'type' => $type,
                'dedupe_key' => $dedupeKey,
                'message' => $error->getMessage(),
            ]);

            return null;
        }

        if ($shouldPush) {
            $this->push($notification, $recipientId, $title, $message, $data);
        }

        return $notification;
    }

    public function refreshAggregate(
        string $recipientId,
        string $dedupeKey,
        string $message,
        array $data,
        bool $markRead = false
    ): ?UserNotification {
        try {
            $notification = UserNotification::where('recipient_id', $recipientId)
                ->where('dedupe_key', $dedupeKey)
                ->first();

            if (!$notification) {
                return null;
            }

            $notification->fill([
                'message' => $message,
                'data' => $data,
                ...($markRead ? ['read_at' => now()] : []),
            ])->save();

            return $notification;
        } catch (\Throwable $error) {
            Log::error('Aggregate notification refresh failed.', [
                'recipient_id' => $recipientId,
                'dedupe_key' => $dedupeKey,
                'message' => $error->getMessage(),
            ]);

            return null;
        }
    }

    private function push(
        UserNotification $notification,
        string $recipientId,
        string $title,
        string $message,
        array $data
    ): void {
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
    }
}
