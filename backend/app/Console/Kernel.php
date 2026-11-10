<?php

namespace App\Console;

use Carbon\Carbon;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;
use Illuminate\Support\Facades\Artisan;

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
        $schedule->command('notifications:dispatch-tasks')
            ->everyFiveMinutes()
            ->withoutOverlapping(10);

        $schedule->command('notifications:dispatch-evaluations')
            ->dailyAt('08:00')
            ->withoutOverlapping(30);

        $schedule->command('attendance:sync-yojadwal --previous-day')
            ->dailyAt('00:30')
            ->timezone(config('app.timezone'))
            ->withoutOverlapping(1440)
            ->onSuccess(function () {
                $closedDate = Carbon::yesterday();

                Artisan::call('score:snapshot-daily', [
                    '--date' => $closedDate->toDateString(),
                ]);

                if ($closedDate->isLastOfMonth()) {
                    Artisan::call('score:snapshot', ['--previous-month' => true]);
                }
            })
            ->runInBackground();
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
