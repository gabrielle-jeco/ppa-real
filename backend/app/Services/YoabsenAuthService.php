<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class YoabsenAuthService
{
    public function enabled(): bool
    {
        return (bool) config('services.yoabsen.enabled', false);
    }

    public function authenticate(string $nik, string $password): bool
    {
        if (!$this->enabled()) {
            return false;
        }

        $baseUrl = rtrim((string) config('services.yoabsen.base_url'), '/');
        $loginPath = '/' . ltrim((string) config('services.yoabsen.login_path', '/api/login'), '/');

        if ($baseUrl === '') {
            Log::warning('Yoabsen login is enabled but YOABSEN_BASE_URL is empty.');
            return false;
        }

        try {
            $response = Http::timeout((int) config('services.yoabsen.timeout', 10))
                ->acceptJson()
                ->withHeaders($this->headers())
                ->post($baseUrl . $loginPath, [
                    config('services.yoabsen.nik_field', 'nik') => $nik,
                    config('services.yoabsen.password_field', 'password') => $password,
                ]);

            if (!$response->successful()) {
                return false;
            }

            $successField = config('services.yoabsen.success_field');
            if ($successField) {
                return (bool) data_get($response->json(), $successField);
            }

            return true;
        } catch (\Throwable $error) {
            Log::warning('Yoabsen login request failed.', [
                'message' => $error->getMessage(),
            ]);

            return false;
        }
    }

    private function headers(): array
    {
        $headers = [];
        $token = config('services.yoabsen.token');

        if ($token) {
            $headers['Authorization'] = 'Bearer ' . $token;
        }

        $appClient = config('services.yoabsen.app_client');
        if ($appClient) {
            $headers['X-App-Client'] = $appClient;
        }

        $cookie = config('services.yoabsen.cookie');
        if ($cookie) {
            $headers['Cookie'] = $cookie;
        }

        return $headers;
    }
}
