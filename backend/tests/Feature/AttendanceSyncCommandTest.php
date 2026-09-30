<?php

namespace Tests\Feature;

use App\Services\YojadwalPresenceService;
use Carbon\Carbon;
use Mockery;
use Tests\TestCase;

class AttendanceSyncCommandTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_previous_day_option_keeps_month_end_on_the_previous_month(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-01 00:30:00', 'Asia/Jakarta'));

        $presenceService = Mockery::mock(YojadwalPresenceService::class);
        $presenceService->shouldReceive('enabled')->once()->andReturnTrue();
        $presenceService->shouldReceive('syncMonth')
            ->once()
            ->with('11010204', 9, 2026)
            ->andReturn(30);
        $this->app->instance(YojadwalPresenceService::class, $presenceService);

        $this->artisan('attendance:sync-yojadwal', [
            '--nik' => ['11010204'],
            '--previous-day' => true,
        ])
            ->expectsOutput('11010204: 30 attendance rows synced.')
            ->expectsOutput('Done. 30 attendance rows synced for 9/2026.')
            ->assertSuccessful();
    }
}
