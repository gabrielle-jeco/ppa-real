<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\YojadwalPresenceService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class SyncYojadwalAttendance extends Command
{
    public const EXIT_PARTIAL_FAILURE = 2;

    protected $signature = 'attendance:sync-yojadwal
        {--nik=* : Specific NIK/username to sync. Can be provided multiple times.}
        {--month= : Month number, defaults to current month.}
        {--year= : Year number, defaults to current year.}
        {--previous-day : Sync the month containing the previous calendar day.}';

    protected $description = 'Sync monthly attendance from YoJadwal presence API into the local attendances table.';

    public static function failedNiksCacheKey(Carbon $targetDate): string
    {
        return 'yojadwal:sync-failed:' . $targetDate->toDateString();
    }

    public function handle(YojadwalPresenceService $presenceService): int
    {
        $targetDate = $this->option('previous-day')
            ? Carbon::yesterday('Asia/Jakarta')
            : Carbon::now('Asia/Jakarta');

        if (!$presenceService->enabled()) {
            Cache::forget(self::failedNiksCacheKey($targetDate));
            $this->warn('YoJadwal/Yoabsen integration is disabled. Set YOJADWAL_ENABLED=true to sync.');
            return self::SUCCESS;
        }

        $month = (int) ($this->option('month') ?: $targetDate->month);
        $year = (int) ($this->option('year') ?: $targetDate->year);
        $niks = collect((array) $this->option('nik'))
            ->map(fn ($nik) => trim((string) $nik))
            ->filter(fn ($nik) => $nik !== '')
            ->unique()
            ->values();

        $totalRows = 0;
        $totalTargets = 0;
        $succeededCount = 0;
        $failedNiks = [];

        if ($niks->isNotEmpty()) {
            foreach ($niks as $nik) {
                $totalTargets++;
                $result = $this->syncNik($presenceService, (string) $nik, $month, $year);
                $totalRows += $result['rows'];
                if ($result['ok']) {
                    $succeededCount++;
                } else {
                    $failedNiks[] = (string) $nik;
                }
            }
        } else {
            User::without(['jobLevel', 'locations', 'userLocations'])
                ->where('active', true)
                ->whereHas('userLocations', function ($query) {
                    $query->whereIn('job_level', ['sc', 'supervisor', 'manager', 'regional_manager']);
                })
                ->orderBy('id')
                ->select(['id', 'username'])
                ->chunkById(250, function ($users) use ($presenceService, $month, $year, &$totalRows, &$totalTargets, &$succeededCount, &$failedNiks) {
                    foreach ($users as $user) {
                        $nik = (string) $user->username;
                        $totalTargets++;
                        $result = $this->syncNik($presenceService, $nik, $month, $year);
                        $totalRows += $result['rows'];
                        if ($result['ok']) {
                            $succeededCount++;
                        } else {
                            $failedNiks[] = $nik;
                        }
                    }
                });
        }

        $failedNiks = array_values(array_unique($failedNiks));
        $failedCount = count($failedNiks);

        if ($totalTargets > 0 && $failedCount === $totalTargets) {
            Cache::forget(self::failedNiksCacheKey($targetDate));
            Log::error('YoJadwal attendance sync failed for all targets.', [
                'target_date' => $targetDate->toDateString(),
                'month' => $month,
                'year' => $year,
                'failed_count' => $failedCount,
            ]);
            $this->error("Sync failed for all {$failedCount} target user(s) on {$month}/{$year}.");

            return self::FAILURE;
        }

        if ($failedCount > 0) {
            Log::warning('YoJadwal attendance sync partially failed.', [
                'target_date' => $targetDate->toDateString(),
                'month' => $month,
                'year' => $year,
                'succeeded_count' => $succeededCount,
                'failed_count' => $failedCount,
                'failed_niks' => $failedNiks,
            ]);

            Cache::put(
                self::failedNiksCacheKey($targetDate),
                [
                    'target_date' => $targetDate->toDateString(),
                    'month' => $month,
                    'year' => $year,
                    'failed_niks' => $failedNiks,
                    'failed_count' => $failedCount,
                    'succeeded_count' => $succeededCount,
                    'recorded_at' => Carbon::now('Asia/Jakarta')->toIso8601String(),
                ],
                Carbon::now('Asia/Jakarta')->addHours(2)
            );

            $this->warn("Partial failure: {$totalRows} attendance rows synced ({$succeededCount} succeeded, {$failedCount} failed) for {$month}/{$year}.");

            return self::EXIT_PARTIAL_FAILURE;
        }

        Cache::forget(self::failedNiksCacheKey($targetDate));
        $this->info("Done. {$totalRows} attendance rows synced for {$month}/{$year}.");

        return self::SUCCESS;
    }

    /**
     * @return array{ok: bool, rows: int, error: ?string}
     */
    private function syncNik(YojadwalPresenceService $presenceService, string $nik, int $month, int $year): array
    {
        $result = $presenceService->syncMonthWithStatus($nik, $month, $year);
        if ($result['ok']) {
            $this->line("{$nik}: {$result['rows']} attendance rows synced.");
        } else {
            $this->warn("{$nik}: sync failed ({$result['error']}).");
        }

        return $result;
    }
}
