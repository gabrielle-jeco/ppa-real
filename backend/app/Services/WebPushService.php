<?php

namespace App\Services;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\Log;

class WebPushService
{
    public function sendToUsers(array $userIds, string $title, string $body, array $data = []): void
    {
        if (!config('services.webpush.enabled')) {
            return;
        }

        if (!class_exists('Minishlink\\WebPush\\WebPush') || !class_exists('Minishlink\\WebPush\\Subscription')) {
            Log::warning('Web Push dependency is not installed. Run composer require minishlink/web-push.');
            return;
        }

        $publicKey = config('services.webpush.public_key');
        $privateKey = config('services.webpush.private_key');
        $subject = config('services.webpush.subject');

        if (!$publicKey || !$privateKey || !$subject) {
            Log::warning('Web Push is enabled but VAPID keys are not configured.');
            return;
        }

        $subscriptions = PushSubscription::whereIn('user_id', array_unique($userIds))->get();
        if ($subscriptions->isEmpty()) {
            return;
        }

        $payload = json_encode([
            'title' => $title,
            'body' => $body,
            'url' => $data['url'] ?? '/',
            'tag' => $data['tag'] ?? 'yodaily',
        ]);

        $webPush = new \Minishlink\WebPush\WebPush([
            'VAPID' => [
                'subject' => $subject,
                'publicKey' => $publicKey,
                'privateKey' => $privateKey,
            ],
        ]);

        foreach ($subscriptions as $subscription) {
            $webPush->queueNotification(
                \Minishlink\WebPush\Subscription::create([
                    'endpoint' => $subscription->endpoint,
                    'publicKey' => $subscription->public_key,
                    'authToken' => $subscription->auth_token,
                    'contentEncoding' => $subscription->content_encoding ?: 'aes128gcm',
                ]),
                $payload
            );
        }

        foreach ($webPush->flush() as $report) {
            $endpoint = (string) $report->getRequest()->getUri();
            if (!$report->isSuccess() && in_array($report->getResponse()?->getStatusCode(), [404, 410], true)) {
                PushSubscription::where('endpoint', $endpoint)->delete();
            }
        }
    }
}
