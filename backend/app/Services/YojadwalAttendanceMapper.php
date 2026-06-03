<?php

namespace App\Services;

use Carbon\Carbon;

class YojadwalAttendanceMapper
{
    /**
     * Normalize the YoJadwal presence response into attendance rows.
     *
     * Expected output per row:
     * [
     *   'date' => '2026-05-01',
     *   'status_code' => 'H',
     *   'raw' => [...]
     * ]
     */
    public function mapPresenceResponse(array $payload, int $month, int $year): array
    {
        $items = $this->extractRows($payload);

        return collect($items)
            ->map(function ($row) use ($month, $year) {
                $date = $this->extractDate($row, $month, $year);
                if (!$date) {
                    return null;
                }

                return [
                    'date' => $date->toDateString(),
                    'status_code' => $this->normalizeStatus($row),
                    'raw' => $row,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    private function extractRows(array $payload): array
    {
        foreach (['data', 'result', 'presence', 'presences', 'attendance', 'attendances'] as $key) {
            $value = data_get($payload, $key);
            if (is_array($value)) {
                return $this->isList($value) ? $value : [$value];
            }
        }

        return $this->isList($payload) ? $payload : [];
    }

    private function extractDate(array $row, int $month, int $year): ?Carbon
    {
        foreach (['date', 'tanggal', 'tgl', 'presence_date', 'attendance_date'] as $key) {
            $value = data_get($row, $key);
            if ($value) {
                try {
                    return Carbon::parse($value);
                } catch (\Throwable $error) {
                    // Try the next known key.
                }
            }
        }

        foreach (['day', 'hari'] as $key) {
            $day = data_get($row, $key);
            if (is_numeric($day)) {
                return Carbon::create($year, $month, (int) $day);
            }
        }

        return null;
    }

    private function normalizeStatus(array $row): string
    {
        $rawStatus = strtolower(trim((string) (
            data_get($row, 'status_code')
            ?? data_get($row, 'kode')
            ?? data_get($row, 'status')
            ?? data_get($row, 'keterangan')
            ?? data_get($row, 'description')
            ?? ''
        )));

        if ($rawStatus === '') {
            return 'A';
        }

        if (in_array($rawStatus, ['h', 'hadir', 'present', 'masuk'], true)) {
            return 'H';
        }

        if (in_array($rawStatus, ['t', 'tl', 'telat', 'terlambat', 'late'], true)) {
            return 'T';
        }

        if (in_array($rawStatus, ['a', 'alpa', 'alpha', 'mangkir', 'absent', 'tidak hadir'], true)) {
            return 'A';
        }

        if (in_array($rawStatus, ['s', 'sd', 'ps', 'sakit', 'sick', 'correction'], true)) {
            return 'S';
        }

        if (in_array($rawStatus, ['c', 'ct', 'cuti', 'leave'], true)) {
            return 'C';
        }

        if (in_array($rawStatus, ['l', 'libur', 'off', 'holiday'], true)) {
            return 'L';
        }

        return strtoupper(substr($rawStatus, 0, 1));
    }

    private function isList(array $value): bool
    {
        return array_keys($value) === range(0, count($value) - 1);
    }
}
