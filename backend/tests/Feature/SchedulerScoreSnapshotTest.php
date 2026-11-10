<?php

namespace Tests\Feature;

use App\Console\Kernel;
use Carbon\Carbon;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Artisan;
use ReflectionMethod;
use Tests\TestCase;

class SchedulerScoreSnapshotTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_successful_month_end_attendance_sync_closes_daily_and_monthly_scores(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-01 01:15:00', 'Asia/Jakarta'));

        Artisan::shouldReceive('call')
            ->once()
            ->with('score:snapshot-daily', ['--date' => '2026-10-31'])
            ->ordered()
            ->andReturn(0);
        Artisan::shouldReceive('call')
            ->once()
            ->with('score:snapshot', ['--previous-month' => true])
            ->ordered()
            ->andReturn(0);

        $this->attendanceSyncEvent()->finish($this->app, 0);
    }

    public function test_successful_regular_attendance_sync_only_closes_the_daily_score(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-02 01:15:00', 'Asia/Jakarta'));

        Artisan::shouldReceive('call')
            ->once()
            ->with('score:snapshot-daily', ['--date' => '2026-11-01'])
            ->andReturn(0);

        $this->attendanceSyncEvent()->finish($this->app, 0);
    }

    private function attendanceSyncEvent()
    {
        config(['cache.default' => 'array']);

        $schedule = new Schedule(config('app.timezone'));
        $kernel = $this->app->make(Kernel::class);
        $method = new ReflectionMethod($kernel, 'schedule');
        $method->setAccessible(true);
        $method->invoke($kernel, $schedule);

        return collect($schedule->events())->firstOrFail(
            fn($event) => str_contains($event->command, 'attendance:sync-yojadwal --previous-day')
        );
    }
}
