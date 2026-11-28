<?php

namespace App\Console;

use App\Console\Commands\SyncYojadwalAttendance;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     *
     * @param  \Illuminate\Console\Scheduling\Schedule  $schedule
     * @return void
     */
    protected function schedule(Schedule $schedule)
    {
        $schedule->command('backup:sync')->everyMinute()->withoutOverlapping(10);

        $schedule->command('notifications:dispatch-tasks')
            ->everyFiveMinutes()
            ->withoutOverlapping(10);

        $schedule->command('notifications:dispatch-evaluations')
            ->dailyAt('08:00')
            ->timezone('Asia/Jakarta')
            ->withoutOverlapping(30);

        $syncEvent = $schedule->command('attendance:sync-yojadwal --previous-day')
            ->dailyAt('00:30')
            ->timezone('Asia/Jakarta')
            ->withoutOverlapping(1440)
            ->runInBackground();

        $syncEvent->then(function () use ($syncEvent) {
            $closedDate = Carbon::yesterday('Asia/Jakarta');
            $exitCode = (int) $syncEvent->exitCode;

            if ($exitCode === Command::SUCCESS) {
                Artisan::call('score:snapshot-daily', [
                    '--date' => $closedDate->toDateString(),
                ]);

                if ($closedDate->isLastOfMonth()) {
                    Artisan::call('score:snapshot', ['--previous-month' => true]);
                }

                return;
            }

            if ($exitCode === SyncYojadwalAttendance::EXIT_PARTIAL_FAILURE) {
                $cacheKey = SyncYojadwalAttendance::failedNiksCacheKey($closedDate);
                $cached = Cache::get($cacheKey);
                $failedNiks = $this->extractValidFailedNiks($cached, $closedDate);

                if ($failedNiks === null) {
                    Log::error('Skipping score snapshots after partial YoJadwal sync because failed-NIK cache is missing or invalid.', [
                        'closed_date' => $closedDate->toDateString(),
                        'cache_key' => $cacheKey,
                    ]);

                    return;
                }

                Log::warning('Running scoped score snapshots excluding users whose YoJadwal sync failed.', [
                    'closed_date' => $closedDate->toDateString(),
                    'excluded_count' => count($failedNiks),
                    'excluded_users' => $failedNiks,
                ]);

                Artisan::call('score:snapshot-daily', [
                    '--date' => $closedDate->toDateString(),
                    '--exclude-user' => $failedNiks,
                ]);

                if ($closedDate->isLastOfMonth()) {
                    Artisan::call('score:snapshot', [
                        '--previous-month' => true,
                        '--exclude-user' => $failedNiks,
                    ]);
                }

                return;
            }

            Log::error('Skipping score snapshots because YoJadwal attendance sync failed.', [
                'closed_date' => $closedDate->toDateString(),
                'exit_code' => $exitCode,
            ]);
        });

        $schedule->command('score:snapshot --previous-month')
            ->monthlyOn(7, '00:30')
            ->timezone('Asia/Jakarta')
            ->withoutOverlapping(1440);
    }

    private function extractValidFailedNiks(mixed $cached, Carbon $closedDate): ?array
    {
        if (!is_array($cached)) {
            return null;
        }

        if (($cached['target_date'] ?? null) !== $closedDate->toDateString()) {
            return null;
        }

        $niks = $cached['failed_niks'] ?? null;
        if (!is_array($niks) || $niks === []) {
            return null;
        }

        $normalized = [];
        foreach ($niks as $nik) {
            if (!is_string($nik) || trim($nik) === '') {
                return null;
            }
            $normalized[] = trim($nik);
        }

        return array_values(array_unique($normalized));
    }

    /**
     * Register the commands for the application.
     *
     * @return void
     */
    protected function commands()
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
