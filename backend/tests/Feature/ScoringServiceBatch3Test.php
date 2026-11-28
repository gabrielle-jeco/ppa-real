<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ScoringService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ScoringServiceBatch3Test extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
        ]);
        DB::purge('sqlite');
        DB::reconnect('sqlite');

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
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_avg_sc_point_today_uses_daily_scores_of_available_crew_and_differs_from_monthly(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-10 15:00:00', 'Asia/Jakarta'));

        DB::table('users')->insert([
            ['username' => 'spv-1', 'name' => 'Supervisor', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-a', 'name' => 'Crew A', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-b', 'name' => 'Crew B', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-off', 'name' => 'Crew Off', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('user_locations')->insert([
            ['user_id' => 'spv-1', 'job_level' => 'supervisor'],
            ['user_id' => 'crew-a', 'job_level' => 'sc'],
            ['user_id' => 'crew-b', 'job_level' => 'sc'],
            ['user_id' => 'crew-off', 'job_level' => 'sc'],
        ]);
        DB::table('reporting_lines')->insert([
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-a', 'status' => 'active', 'relation_type' => 'permanent'],
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-b', 'status' => 'active', 'relation_type' => 'permanent'],
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-off', 'status' => 'active', 'relation_type' => 'permanent'],
        ]);

        // Day 10: crew-a has H + approved task (100), crew-b has H + pending task (0), crew-off is O (unavailable).
        DB::table('attendances')->insert([
            ['user_id' => 'crew-a', 'date' => '2026-10-10', 'status_code' => 'H'],
            ['user_id' => 'crew-b', 'date' => '2026-10-10', 'status_code' => 'H'],
            ['user_id' => 'crew-off', 'date' => '2026-10-10', 'status_code' => 'O'],
        ]);
        $approvedId = DB::table('tasks')->insertGetId([
            'employee_id' => 'crew-a',
            'employer_id' => 'spv-1',
            'due_at' => '2026-10-10 18:00:00',
            'status' => 'approved',
        ]);
        DB::table('task_evidences')->insert([
            ['task_id' => $approvedId, 'type' => 'before'],
            ['task_id' => $approvedId, 'type' => 'after'],
        ]);
        DB::table('tasks')->insert([
            'employee_id' => 'crew-b',
            'employer_id' => 'spv-1',
            'due_at' => '2026-10-10 18:00:00',
            'status' => 'pending',
        ]);

        // On day 10: available crew scores = [100, 0] -> avg = 50 (crew-off is excluded from today's denominator).
        // Monthly avg across 3 crew is lower because attendance_count is 1/25 and crew-off has 0 task points.
        $spv = User::where('username', 'spv-1')->firstOrFail();
        $stats = app(ScoringService::class)->getSupervisorMonthlyDetailedScore($spv, Carbon::parse('2026-10-10', 'Asia/Jakarta'));

        $this->assertSame(50, $stats['avg_sc_point_today']);
        $this->assertNotSame($stats['avg_service_crew_point'], $stats['avg_sc_point_today']);

        // Date with no available SC -> 0
        $emptyStats = app(ScoringService::class)->getSupervisorMonthlyDetailedScore($spv, Carbon::parse('2026-10-09', 'Asia/Jakarta'));
        $this->assertSame(0, $emptyStats['avg_sc_point_today']);
    }

    public function test_personality_and_manager_review_filter_type_and_average_valid_evaluators_deterministically(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-15 10:00:00', 'Asia/Jakarta'));

        DB::table('users')->insert([
            ['username' => 'mgr-1', 'name' => 'Manager 1', 'active' => true],
            ['username' => 'mgr-2', 'name' => 'Manager 2', 'active' => true],
            ['username' => 'spv-1', 'name' => 'Supervisor 1', 'active' => true],
            ['username' => 'spv-2', 'name' => 'Supervisor 2', 'active' => true],
            ['username' => 'crew-1', 'name' => 'Crew 1', 'active' => true],
        ]);
        DB::table('reporting_lines')->insert([
            ['leader_id' => 'mgr-1', 'subordinate_id' => 'spv-1', 'status' => 'active', 'relation_type' => 'permanent'],
            ['leader_id' => 'mgr-2', 'subordinate_id' => 'spv-1', 'status' => 'active', 'relation_type' => 'permanent'],
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-1', 'status' => 'active', 'relation_type' => 'permanent'],
            ['leader_id' => 'spv-2', 'subordinate_id' => 'crew-1', 'status' => 'active', 'relation_type' => 'permanent'],
        ]);

        // Unrelated manager_review on crew-1 (should be ignored for crew personality score) and 2 personality rows -> AVG(60, 90) = 75
        DB::table('monthly_personality_evaluations')->insert([
            [
                'evaluatee_id' => 'crew-1',
                'evaluator_id' => 'mgr-1',
                'evaluation_period' => '2026-09-01',
                'evaluation_type' => 'manager_review',
                'score' => 20,
                'created_at' => '2026-10-01 08:00:00',
                'updated_at' => '2026-10-01 08:00:00',
            ],
            [
                'evaluatee_id' => 'crew-1',
                'evaluator_id' => 'spv-1',
                'evaluation_period' => '2026-09-01',
                'evaluation_type' => 'personality',
                'score' => 60,
                'created_at' => '2026-10-02 08:00:00',
                'updated_at' => '2026-10-02 08:00:00',
            ],
            [
                'evaluatee_id' => 'crew-1',
                'evaluator_id' => 'spv-2',
                'evaluation_period' => '2026-09-01',
                'evaluation_type' => 'personality',
                'score' => 90,
                'created_at' => '2026-10-02 09:00:00',
                'updated_at' => '2026-10-02 09:00:00',
            ],
            // Supervisor manager_review from 2 managers -> AVG(70, 90) = 80 (personality row ignored)
            [
                'evaluatee_id' => 'spv-1',
                'evaluator_id' => 'mgr-1',
                'evaluation_period' => '2026-10-01',
                'evaluation_type' => 'personality',
                'score' => 10,
                'created_at' => '2026-10-25 08:00:00',
                'updated_at' => '2026-10-25 08:00:00',
            ],
            [
                'evaluatee_id' => 'spv-1',
                'evaluator_id' => 'mgr-1',
                'evaluation_period' => '2026-10-01',
                'evaluation_type' => 'manager_review',
                'score' => 70,
                'created_at' => '2026-10-25 09:00:00',
                'updated_at' => '2026-10-25 09:00:00',
            ],
            [
                'evaluatee_id' => 'spv-1',
                'evaluator_id' => 'mgr-2',
                'evaluation_period' => '2026-10-01',
                'evaluation_type' => 'manager_review',
                'score' => 90,
                'created_at' => '2026-10-25 10:00:00',
                'updated_at' => '2026-10-25 10:00:00',
            ],
        ]);

        $service = app(ScoringService::class);
        $crew = User::where('username', 'crew-1')->firstOrFail();
        $crewMonthly = $service->getCrewMonthlyScore($crew, Carbon::parse('2026-09-01', 'Asia/Jakarta'));
        $this->assertSame(75, $crewMonthly['personality_score']);

        $spv = User::where('username', 'spv-1')->firstOrFail();
        $spvStats = $service->getSupervisorMonthlyDetailedScore($spv, Carbon::parse('2026-10-01', 'Asia/Jakarta'));
        $this->assertSame(80, $spvStats['task_from_manager']['completed']);
    }
}
