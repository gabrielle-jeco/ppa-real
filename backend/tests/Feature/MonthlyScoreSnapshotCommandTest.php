<?php

namespace Tests\Feature;

use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MonthlyScoreSnapshotCommandTest extends TestCase
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
        Schema::create('reporting_lines', function (Blueprint $table) {
            $table->id();
            $table->string('leader_id');
            $table->string('subordinate_id');
            $table->string('status')->default('active');
            $table->string('relation_type')->default('permanent');
            $table->unsignedBigInteger('backup_request_id')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_until')->nullable();
        });
        $this->createBackupTables();
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
            $table->string('employer_id')->nullable();
            $table->dateTime('start_at')->nullable();
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
        Schema::create('guide_reads', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->date('read_date');
        });
        Schema::create('monthly_personality_evaluations', function (Blueprint $table) {
            $table->id();
            $table->string('evaluatee_id');
            $table->string('evaluator_id');
            $table->date('evaluation_period');
            $table->string('evaluation_type')->default('personality');
            $table->double('score');
            $table->json('scores')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
        Schema::create('monthly_overall_scores', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('period');
            $table->integer('final_score');
            $table->json('details')->nullable();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_previous_month_option_handles_the_year_boundary(): void
    {
        Carbon::setTestNow(Carbon::parse('2027-01-01 02:00:00', 'Asia/Jakarta'));

        $this->artisan('score:snapshot', ['--previous-month' => true])
            ->expectsOutput('Taking score snapshot for December 2026...')
            ->expectsOutput('Snapshot completed! Processed 0 Crews and 0 Supervisors.')
            ->assertSuccessful();
    }

    public function test_monthly_snapshot_filters_inactive_users_unless_active_or_with_target_month_activity_and_preserves_history(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-01 01:00:00', 'Asia/Jakarta'));

        DB::table('users')->insert([
            ['username' => 'crew-active', 'name' => 'Active Crew', 'active' => true],
            ['username' => 'crew-inactive-old', 'name' => 'Long Inactive Crew', 'active' => false],
            ['username' => 'crew-inactive-att', 'name' => 'Inactive With Attendance', 'active' => false],
            ['username' => 'crew-inactive-task', 'name' => 'Inactive With Task Due', 'active' => false],
            ['username' => 'crew-inactive-crossmonth', 'name' => 'Inactive Task Start Only', 'active' => false],
            ['username' => 'spv-inactive-eval', 'name' => 'Inactive Spv Eval', 'active' => false],
        ]);

        DB::table('user_locations')->insert([
            ['user_id' => 'crew-active', 'job_level' => 'sc'],
            ['user_id' => 'crew-inactive-old', 'job_level' => 'sc'],
            ['user_id' => 'crew-inactive-att', 'job_level' => 'sc'],
            ['user_id' => 'crew-inactive-task', 'job_level' => 'sc'],
            ['user_id' => 'crew-inactive-crossmonth', 'job_level' => 'sc'],
            ['user_id' => 'spv-inactive-eval', 'job_level' => 'supervisor'],
        ]);

        // Historical snapshot from September 2026 for long-inactive crew must stay untouched.
        DB::table('monthly_overall_scores')->insert([
            'user_id' => 'crew-inactive-old',
            'period' => '2026-09-01',
            'final_score' => 77,
            'details' => json_encode(['preserved' => true]),
        ]);

        // Activity in October 2026 (target month)
        DB::table('attendances')->insert([
            'user_id' => 'crew-inactive-att',
            'date' => '2026-10-15',
            'status_code' => 'H',
        ]);
        DB::table('tasks')->insert([
            [
                'employee_id' => 'crew-inactive-task',
                'employer_id' => 'spv-inactive-eval',
                'start_at' => '2026-10-10 08:00:00',
                'due_at' => '2026-10-10 18:00:00',
                'status' => 'pending',
            ],
            [
                // Task started in Oct, but due_at is Nov (outside October due_at window) -> should NOT trigger October activity
                'employee_id' => 'crew-inactive-crossmonth',
                'employer_id' => null,
                'start_at' => '2026-10-31 08:00:00',
                'due_at' => '2026-11-01 18:00:00',
                'status' => 'pending',
            ],
        ]);

        $this->artisan('score:snapshot', ['--previous-month' => true])
            ->expectsOutput('Snapshot completed! Processed 3 Crews and 1 Supervisors.')
            ->assertSuccessful();

        foreach (['crew-active', 'crew-inactive-att', 'crew-inactive-task', 'spv-inactive-eval'] as $uid) {
            $this->assertTrue(
                DB::table('monthly_overall_scores')->where('user_id', $uid)->whereDate('period', '2026-10-01')->exists(),
                "Expected October 2026 snapshot for {$uid}"
            );
        }

        foreach (['crew-inactive-old', 'crew-inactive-crossmonth'] as $uid) {
            $this->assertFalse(
                DB::table('monthly_overall_scores')->where('user_id', $uid)->whereDate('period', '2026-10-01')->exists(),
                "Did not expect October 2026 snapshot for {$uid}"
            );
        }

        // Pre-existing September snapshot preserved verbatim
        $this->assertSame(
            77,
            (int) DB::table('monthly_overall_scores')
                ->where('user_id', 'crew-inactive-old')
                ->whereDate('period', '2026-09-01')
                ->value('final_score')
        );

        // --exclude-user omits the excluded username cleanly
        DB::table('monthly_overall_scores')->whereDate('period', '2026-10-01')->delete();
        $this->artisan('score:snapshot', ['--previous-month' => true, '--exclude-user' => ['crew-active']])
            ->assertSuccessful();

        $this->assertFalse(
            DB::table('monthly_overall_scores')->where('user_id', 'crew-active')->whereDate('period', '2026-10-01')->exists()
        );
        $this->assertTrue(
            DB::table('monthly_overall_scores')->where('user_id', 'crew-inactive-att')->whereDate('period', '2026-10-01')->exists()
        );
    }
}
