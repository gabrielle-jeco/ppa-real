<?php

namespace App\Services;

use App\Models\Attendance;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class YojadwalPresenceService
{
    public function __construct(private YojadwalAttendanceMapper $mapper)
    {
    }

    public function enabled(): bool
    {
        return (bool) config('services.yoabsen.enabled', false);
    }

    public function fetchPresence(string $nik, int $month, int $year): ?array
    {
        $baseUrl = rtrim((string) config('services.yoabsen.base_url'), '/');
        $presencePath = '/' . ltrim((string) config('services.yoabsen.presence_path', '/api/presence'), '/');

        if ($baseUrl === '') {
            Log::warning('YoJadwal presence sync is enabled but base URL is empty.');
            return null;
        }

        try {
            $response = Http::timeout((int) config('services.yoabsen.timeout', 10))
                ->acceptJson()
                ->withHeaders($this->headers())
                ->get($baseUrl . $presencePath, [
                    'nik' => $nik,
                    'bulan' => str_pad((string) $month, 2, '0', STR_PAD_LEFT),
                    'tahun' => $year,
                ]);

            if (!$response->successful()) {
                Log::warning('YoJadwal presence request returned non-success.', [
                    'nik' => $nik,
                    'month' => $month,
                    'year' => $year,
                    'status' => $response->status(),
                ]);
                return null;
            }

            return $response->json();
        } catch (\Throwable $error) {
            Log::warning('YoJadwal presence request failed.', [
                'nik' => $nik,
                'month' => $month,
                'year' => $year,
                'message' => $error->getMessage(),
            ]);

            return null;
        }
    }

    public function syncMonth(string $nik, int $month, int $year): int
    {
        $payload = $this->fetchPresence($nik, $month, $year);
        if (!$payload) {
            return 0;
        }

        $rows = $this->mapper->mapPresenceResponse($payload, $month, $year);

        foreach ($rows as $row) {
            Attendance::updateOrCreate(
                [
                    'user_id' => $nik,
                    'date' => $row['date'],
                ],
                [
                    'status_code' => $row['status_code'],
                ]
            );
        }

        return count($rows);
    }

    private function headers(): array
    {
        $headers = [];

        $appClient = config('services.yoabsen.app_client');
        if ($appClient) {
            $headers['X-App-Client'] = $appClient;
        }

        $token = config('services.yoabsen.token');
        if ($token) {
            $headers['Authorization'] = 'Bearer ' . $token;
        }

        $cookie = config('services.yoabsen.cookie');
        if ($cookie) {
            $headers['Cookie'] = $cookie;
        }

        return $headers;
    }
}
