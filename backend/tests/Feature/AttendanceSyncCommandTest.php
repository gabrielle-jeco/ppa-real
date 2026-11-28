<?php

namespace Tests\Feature;

use App\Console\Commands\SyncYojadwalAttendance;
use App\Services\YojadwalPresenceService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

class AttendanceSyncCommandTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'cache.default' => 'array',
            'services.yoabsen.enabled' => true,
            'services.yoabsen.base_url' => 'https://yojadwal.test',
            'services.yoabsen.presence_path' => '/api/presence',
        ]);
        app('cache')->setDefaultDriver('array');
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->unique();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('user_locations', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('job_level')->nullable();
        });
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('date');
            $table->string('status_code');
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_previous_day_option_keeps_month_end_on_the_previous_month(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-01 00:30:00', 'Asia/Jakarta'));

        $presenceService = Mockery::mock(YojadwalPresenceService::class);
        $presenceService->shouldReceive('enabled')->once()->andReturnTrue();
        $presenceService->shouldReceive('syncMonthWithStatus')
            ->once()
            ->with('11010204', 9, 2026)
            ->andReturn(['ok' => true, 'rows' => 30, 'error' => null]);
        $this->app->instance(YojadwalPresenceService::class, $presenceService);

        $this->artisan('attendance:sync-yojadwal', [
            '--nik' => ['11010204'],
            '--previous-day' => true,
        ])
            ->expectsOutput('11010204: 30 attendance rows synced.')
            ->expectsOutput('Done. 30 attendance rows synced for 9/2026.')
            ->assertExitCode(0);
    }

    public function test_disabled_yojadwal_returns_success_so_local_attendance_snapshots_still_run(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-15 00:30:00', 'Asia/Jakarta'));
        config(['services.yoabsen.enabled' => false]);

        $this->artisan('attendance:sync-yojadwal', ['--previous-day' => true])
            ->expectsOutput('YoJadwal/Yoabsen integration is disabled. Set YOJADWAL_ENABLED=true to sync.')
            ->assertExitCode(0);
    }

    public function test_empty_valid_upstream_response_is_success_while_upstream_error_returns_failure(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-15 00:30:00', 'Asia/Jakarta'));

        Http::fake([
            'https://yojadwal.test/api/presence*' => Http::sequence()
                ->push(['data' => []], 200)
                ->push('upstream error', 500),
        ]);

        // Valid HTTP 200 with 0 rows -> exit 0
        $this->artisan('attendance:sync-yojadwal', [
            '--nik' => ['nik-empty'],
            '--previous-day' => true,
        ])->assertExitCode(0);

        // HTTP 500 for sole target -> total failure exit 1
        $this->artisan('attendance:sync-yojadwal', [
            '--nik' => ['nik-fail'],
            '--previous-day' => true,
        ])->assertExitCode(1);
    }

    public function test_partial_failure_returns_exit_2_caches_failed_niks_and_preserves_local_attendance(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-15 00:30:00', 'Asia/Jakarta'));

        DB::table('attendances')->insert([
            'user_id' => 'nik-fail',
            'date' => '2026-10-14',
            'status_code' => 'H',
        ]);

        Http::fake(function ($request) {
            if ($request['nik'] === 'nik-ok') {
                return Http::response([
                    'data' => [
                        ['date' => '2026-10-14', 'status_code' => 'H'],
                    ],
                ], 200);
            }

            return Http::response(['message' => 'Internal error'], 500);
        });

        $this->artisan('attendance:sync-yojadwal', [
            '--nik' => ['nik-ok', 'nik-fail'],
            '--previous-day' => true,
        ])->assertExitCode(SyncYojadwalAttendance::EXIT_PARTIAL_FAILURE);

        $this->assertDatabaseHas('attendances', [
            'user_id' => 'nik-ok',
            'date' => '2026-10-14',
            'status_code' => 'H',
        ]);
        // Failed NIK retains local attendance untouched
        $this->assertDatabaseHas('attendances', [
            'user_id' => 'nik-fail',
            'date' => '2026-10-14',
            'status_code' => 'H',
        ]);

        $cached = Cache::get(SyncYojadwalAttendance::failedNiksCacheKey(Carbon::yesterday('Asia/Jakarta')));
        $this->assertIsArray($cached);
        $this->assertSame('2026-10-14', $cached['target_date']);
        $this->assertSame(['nik-fail'], $cached['failed_niks']);
    }
}
