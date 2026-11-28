<?php

namespace Tests\Feature;

use App\Services\WebPushService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

class EvaluationReminderCommandTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->json('permissions')->nullable();
        });
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->unique();
            $table->string('name');
            $table->unsignedBigInteger('role_id')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('user_locations', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('job_level')->nullable();
        });
        Schema::create('reporting_lines', function (Blueprint $table) {
            $table->id();
            $table->string('leader_id');
            $table->string('subordinate_id');
            $table->string('status')->default('active');
            $table->string('relation_type')->default('permanent');
            $table->date('effective_from')->nullable();
            $table->date('effective_until')->nullable();
            $table->unsignedBigInteger('backup_request_id')->nullable();
        });
        $this->createBackupTables();
        Schema::create('monthly_personality_evaluations', function (Blueprint $table) {
            $table->id();
            $table->string('evaluatee_id');
            $table->string('evaluator_id');
            $table->date('evaluation_period');
            $table->string('evaluation_type')->default('personality');
            $table->double('score');
            $table->timestamps();
        });
        Schema::create('user_notifications', function (Blueprint $table) {
            $table->id();
            $table->string('recipient_id');
            $table->string('type');
            $table->string('title');
            $table->text('message');
            $table->text('description')->nullable();
            $table->json('data')->nullable();
            $table->string('dedupe_key')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->unique(['recipient_id', 'dedupe_key']);
        });

        DB::table('users')->insert([
            ['username' => 'mgr-1', 'name' => 'Manager 1', 'active' => true],
            ['username' => 'spv-1', 'name' => 'Supervisor 1', 'active' => true],
            ['username' => 'crew-1', 'name' => 'Crew 1', 'active' => true],
        ]);
        DB::table('user_locations')->insert([
            ['user_id' => 'mgr-1', 'job_level' => 'manager'],
            ['user_id' => 'spv-1', 'job_level' => 'supervisor'],
            ['user_id' => 'crew-1', 'job_level' => 'sc'],
        ]);
        DB::table('reporting_lines')->insert([
            ['leader_id' => 'mgr-1', 'subordinate_id' => 'spv-1', 'status' => 'active', 'relation_type' => 'permanent'],
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-1', 'status' => 'active', 'relation_type' => 'permanent'],
        ]);

        $pushMock = Mockery::mock(WebPushService::class);
        $pushMock->shouldReceive('sendToUsers')->andReturnNull();
        $this->app->instance(WebPushService::class, $pushMock);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_days_1_to_6_only_remind_supervisors_for_previous_month_and_deduplicate_open_and_final(): void
    {
        // Day 2 -> SPV open reminder for 2026-09 (manager receives nothing)
        Carbon::setTestNow(Carbon::parse('2026-10-02 08:00:00', 'Asia/Jakarta'));
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();

        $this->assertSame(1, DB::table('user_notifications')->count());
        $this->assertDatabaseHas('user_notifications', [
            'recipient_id' => 'spv-1',
            'dedupe_key' => 'evaluation-personality-open-2026-09',
        ]);
        $this->assertDatabaseMissing('user_notifications', ['recipient_id' => 'mgr-1']);

        // Day 5 -> SPV final reminder for 2026-09 (idempotent on repeat)
        Carbon::setTestNow(Carbon::parse('2026-10-05 08:00:00', 'Asia/Jakarta'));
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();

        $this->assertSame(2, DB::table('user_notifications')->count());
        $this->assertDatabaseHas('user_notifications', [
            'recipient_id' => 'spv-1',
            'dedupe_key' => 'evaluation-personality-final-2026-09',
        ]);
    }

    public function test_day_7_and_mid_month_send_no_reminders(): void
    {
        foreach (['2026-10-07 08:00:00', '2026-10-15 08:00:00'] as $dateTime) {
            Carbon::setTestNow(Carbon::parse($dateTime, 'Asia/Jakarta'));
            $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();
        }

        $this->assertDatabaseCount('user_notifications', 0);
    }

    public function test_last_7_days_only_remind_managers_for_current_month_and_deduplicate(): void
    {
        // October has 31 days -> last 7 days = Oct 25..31; open = Oct 25..28, final = Oct 29..31
        Carbon::setTestNow(Carbon::parse('2026-10-25 08:00:00', 'Asia/Jakarta'));
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();

        $this->assertSame(1, DB::table('user_notifications')->count());
        $this->assertDatabaseHas('user_notifications', [
            'recipient_id' => 'mgr-1',
            'dedupe_key' => 'evaluation-manager_review-open-2026-10',
        ]);
        $this->assertDatabaseMissing('user_notifications', ['recipient_id' => 'spv-1']);

        // Final 3 days -> Oct 29
        Carbon::setTestNow(Carbon::parse('2026-10-29 08:00:00', 'Asia/Jakarta'));
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();

        $this->assertSame(2, DB::table('user_notifications')->count());
        $this->assertDatabaseHas('user_notifications', [
            'recipient_id' => 'mgr-1',
            'dedupe_key' => 'evaluation-manager_review-final-2026-10',
        ]);
        $this->assertDatabaseMissing('user_notifications', ['recipient_id' => 'spv-1']);
    }

    public function test_completed_evaluations_suppress_reminders(): void
    {
        DB::table('monthly_personality_evaluations')->insert([
            [
                'evaluatee_id' => 'crew-1',
                'evaluator_id' => 'spv-1',
                'evaluation_period' => '2026-09-01',
                'evaluation_type' => 'personality',
                'score' => 90,
            ],
            [
                'evaluatee_id' => 'spv-1',
                'evaluator_id' => 'mgr-1',
                'evaluation_period' => '2026-10-01',
                'evaluation_type' => 'manager_review',
                'score' => 95,
            ],
        ]);

        Carbon::setTestNow(Carbon::parse('2026-10-03 08:00:00', 'Asia/Jakarta'));
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();

        Carbon::setTestNow(Carbon::parse('2026-10-26 08:00:00', 'Asia/Jakarta'));
        $this->artisan('notifications:dispatch-evaluations')->assertSuccessful();

        $this->assertDatabaseCount('user_notifications', 0);
    }
}
