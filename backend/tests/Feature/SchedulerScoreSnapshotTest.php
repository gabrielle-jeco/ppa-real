<?php

namespace Tests\Feature;

use App\Console\Commands\SyncYojadwalAttendance;
use App\Console\Kernel;
use Carbon\Carbon;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use ReflectionMethod;
use Tests\TestCase;

class SchedulerScoreSnapshotTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array']);
        app('cache')->setDefaultDriver('array');
    }

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

    public function test_total_sync_failure_skips_all_snapshots(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-01 01:15:00', 'Asia/Jakarta'));

        Artisan::shouldReceive('call')->never();

        $this->attendanceSyncEvent()->finish($this->app, 1);
    }

    public function test_partial_sync_failure_with_valid_cache_runs_snapshots_excluding_failed_niks(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-01 01:15:00', 'Asia/Jakarta'));
        $closedDate = Carbon::yesterday('Asia/Jakarta');

        Cache::put(
            SyncYojadwalAttendance::failedNiksCacheKey($closedDate),
            [
                'target_date' => '2026-10-31',
                'failed_niks' => ['nik-fail-1', 'nik-fail-2'],
            ],
            600
        );

        Artisan::shouldReceive('call')
            ->once()
            ->with('score:snapshot-daily', [
                '--date' => '2026-10-31',
                '--exclude-user' => ['nik-fail-1', 'nik-fail-2'],
            ])
            ->ordered()
            ->andReturn(0);
        Artisan::shouldReceive('call')
            ->once()
            ->with('score:snapshot', [
                '--previous-month' => true,
                '--exclude-user' => ['nik-fail-1', 'nik-fail-2'],
            ])
            ->ordered()
            ->andReturn(0);

        $this->attendanceSyncEvent()->finish($this->app, SyncYojadwalAttendance::EXIT_PARTIAL_FAILURE);
    }

    public function test_partial_sync_failure_with_missing_or_invalid_cache_skips_snapshots_safely(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-01 01:15:00', 'Asia/Jakarta'));
        $closedDate = Carbon::yesterday('Asia/Jakarta');

        // Case 1: missing cache -> must NOT run full snapshot
        Cache::forget(SyncYojadwalAttendance::failedNiksCacheKey($closedDate));
        Artisan::shouldReceive('call')->never();
        $this->attendanceSyncEvent()->finish($this->app, SyncYojadwalAttendance::EXIT_PARTIAL_FAILURE);

        // Case 2: stale/mismatched target_date cache -> must NOT run full snapshot
        Cache::put(
            SyncYojadwalAttendance::failedNiksCacheKey($closedDate),
            [
                'target_date' => '2026-10-30',
                'failed_niks' => ['nik-fail-1'],
            ],
            600
        );
        $this->attendanceSyncEvent()->finish($this->app, SyncYojadwalAttendance::EXIT_PARTIAL_FAILURE);

        // Case 3: malformed empty failed_niks -> must NOT run full snapshot
        Cache::put(
            SyncYojadwalAttendance::failedNiksCacheKey($closedDate),
            [
                'target_date' => '2026-10-31',
                'failed_niks' => [],
            ],
            600
        );
        $this->attendanceSyncEvent()->finish($this->app, SyncYojadwalAttendance::EXIT_PARTIAL_FAILURE);
    }

    public function test_final_monthly_snapshot_and_evaluation_reminders_are_scheduled_in_asia_jakarta(): void
    {
        $events = $this->scheduledEvents();

        $finalSnapshot = $events->first(
            fn ($event) => str_contains((string) $event->command, 'score:snapshot --previous-month')
        );
        $this->assertNotNull($finalSnapshot);
        $this->assertSame('Asia/Jakarta', (string) $finalSnapshot->timezone);
        $this->assertSame('30 0 7 * *', $finalSnapshot->expression);

        $evalReminder = $events->first(
            fn ($event) => str_contains((string) $event->command, 'notifications:dispatch-evaluations')
        );
        $this->assertNotNull($evalReminder);
        $this->assertSame('Asia/Jakarta', (string) $evalReminder->timezone);
        $this->assertSame('0 8 * * *', $evalReminder->expression);
    }

    private function attendanceSyncEvent()
    {
        return $this->scheduledEvents()->firstOrFail(
            fn ($event) => str_contains((string) $event->command, 'attendance:sync-yojadwal --previous-day')
        );
    }

    private function scheduledEvents()
    {
        $schedule = new Schedule(config('app.timezone'));
        $kernel = $this->app->make(Kernel::class);
        $method = new ReflectionMethod($kernel, 'schedule');
        $method->setAccessible(true);
        $method->invoke($kernel, $schedule);

        return collect($schedule->events());
    }
}
