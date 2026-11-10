<?php

namespace Tests\Feature;

use App\Models\DailyScore;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DailyScoreSnapshotCommandTest extends TestCase
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
            $table->boolean('is_back_office')->default(false);
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
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('employee_id');
            $table->dateTime('due_at');
            $table->string('status')->default('pending');
            $table->dateTime('revision_deadline_at')->nullable();
            $table->timestamps();
        });
        Schema::create('task_evidences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->string('type');
            $table->unsignedTinyInteger('attempt_no')->nullable();
            $table->string('review_status')->nullable();
            $table->decimal('awarded_score', 5, 2)->nullable();
            $table->timestamps();
        });
        Schema::create('daily_scores', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('score_date');
            $table->string('category');
            $table->decimal('score', 5, 2)->nullable();
            $table->boolean('available');
            $table->string('availability_mode');
            $table->string('unavailable_reason')->nullable();
            $table->string('attendance_status')->nullable();
            $table->unsignedInteger('approved_tasks');
            $table->unsignedInteger('unapproved_tasks');
            $table->unsignedBigInteger('scoring_rule_id')->nullable();
            $table->json('details')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'score_date', 'category']);
        });
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_it_stores_an_auditable_daily_score_and_updates_it_idempotently(): void
    {
        DB::table('users')->insert([
            ['username' => 'crew-1', 'name' => 'Crew', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'inactive-crew', 'name' => 'Inactive', 'active' => false, 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('user_locations')->insert([
            ['user_id' => 'crew-1', 'job_level' => 'sc'],
            ['user_id' => 'inactive-crew', 'job_level' => 'sc'],
        ]);
        DB::table('attendances')->insert([
            'user_id' => 'crew-1',
            'date' => '2026-11-09',
            'status_code' => 'H',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $taskId = DB::table('tasks')->insertGetId([
            'employee_id' => 'crew-1',
            'due_at' => '2026-11-09 18:00:00',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('task_evidences')->insert([
            ['task_id' => $taskId, 'type' => 'before', 'created_at' => now(), 'updated_at' => now()],
            ['task_id' => $taskId, 'type' => 'after', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->artisan('score:snapshot-daily', ['--date' => '2026-11-09'])
            ->expectsOutput('Daily score snapshot completed for 2026-11-09: 1 crew processed.')
            ->assertSuccessful();

        $snapshot = DailyScore::firstOrFail();
        $this->assertSame('crew-1', $snapshot->user_id);
        $this->assertSame('2026-11-09', $snapshot->score_date->toDateString());
        $this->assertSame(100.0, $snapshot->score);
        $this->assertTrue($snapshot->available);
        $this->assertSame('H', $snapshot->attendance_status);
        $this->assertSame(1, $snapshot->approved_tasks);
        $this->assertSame(0, $snapshot->unapproved_tasks);
        $this->assertDatabaseMissing('daily_scores', ['user_id' => 'inactive-crew']);

        DB::table('tasks')->where('id', $taskId)->update(['status' => 'pending']);
        $this->artisan('score:snapshot-daily', ['--date' => '2026-11-09'])->assertSuccessful();

        $this->assertSame(1, DB::table('daily_scores')->count());
        $snapshot->refresh();
        $this->assertSame(0.0, $snapshot->score);
        $this->assertSame(0, $snapshot->approved_tasks);
        $this->assertSame(1, $snapshot->unapproved_tasks);
    }

    public function test_default_date_is_yesterday_and_invalid_dates_are_rejected(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-10 01:00:00', 'Asia/Jakarta'));

        $this->artisan('score:snapshot-daily')
            ->expectsOutput('Daily score snapshot completed for 2026-11-09: 0 crew processed.')
            ->assertSuccessful();

        $this->artisan('score:snapshot-daily', ['--date' => '09-11-2026'])
            ->expectsOutput('The --date option must use Y-m-d format.')
            ->assertExitCode(2);
    }
}
