<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class TeamScoreReportTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
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

        DB::table('users')->insert([
            ['username' => 'spv-1', 'name' => 'Supervisor', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-1', 'name' => 'Crew Permanen', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-2', 'name' => 'Crew Backup', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-3', 'name' => 'Crew Lain', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('user_locations')->insert([
            ['user_id' => 'spv-1', 'job_level' => 'supervisor'],
            ['user_id' => 'crew-1', 'job_level' => 'sc'],
            ['user_id' => 'crew-2', 'job_level' => 'sc'],
            ['user_id' => 'crew-3', 'job_level' => 'sc'],
        ]);
        DB::table('reporting_lines')->insert([
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-1', 'status' => 'active', 'relation_type' => 'permanent', 'effective_from' => null, 'effective_until' => null],
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-2', 'status' => 'active', 'relation_type' => 'backup', 'effective_from' => '2026-10-01', 'effective_until' => '2026-10-31'],
        ]);

        Carbon::setTestNow(Carbon::parse('2026-10-10 13:00:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_daily_report_only_contains_active_permanent_team_and_uses_task_score(): void
    {
        DB::table('attendances')->insert([
            ['user_id' => 'crew-1', 'date' => '2026-10-09', 'status_code' => 'H'],
            ['user_id' => 'crew-1', 'date' => '2026-10-10', 'status_code' => 'H'],
        ]);
        $approvedTask = DB::table('tasks')->insertGetId([
            'employee_id' => 'crew-1',
            'due_at' => '2026-10-09 18:00:00',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('task_evidences')->insert([
            ['task_id' => $approvedTask, 'type' => 'before', 'created_at' => now(), 'updated_at' => now()],
            ['task_id' => $approvedTask, 'type' => 'after', 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('tasks')->insert([
            'employee_id' => 'crew-1',
            'due_at' => '2026-10-10 18:00:00',
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($this->supervisor(), 'sanctum')
            ->getJson('/api/supervisor/team-scores/daily?start_date=2026-10-09&end_date=2026-10-10')
            ->assertOk()
            ->assertJsonCount(1, 'members')
            ->assertJsonPath('members.0.id', 'crew-1')
            ->assertJsonPath('members.0.approved_tasks', 1)
            ->assertJsonPath('members.0.unapproved_tasks', 1)
            ->assertJsonPath('members.0.score', 50);
    }

    public function test_detail_rejects_employee_outside_permanent_team(): void
    {
        $this->actingAs($this->supervisor(), 'sanctum')
            ->getJson('/api/supervisor/team-scores/daily/crew-2?start_date=2026-10-09&end_date=2026-10-10')
            ->assertForbidden();

        $this->actingAs($this->supervisor(), 'sanctum')
            ->getJson('/api/supervisor/team-scores/daily/crew-3?start_date=2026-10-09&end_date=2026-10-10')
            ->assertForbidden();
    }

    public function test_daily_range_is_limited_to_31_calendar_days(): void
    {
        $this->actingAs($this->supervisor(), 'sanctum')
            ->getJson('/api/supervisor/team-scores/daily?start_date=2026-09-10&end_date=2026-10-10')
            ->assertOk();

        $this->actingAs($this->supervisor(), 'sanctum')
            ->getJson('/api/supervisor/team-scores/daily?start_date=2026-09-09&end_date=2026-10-10')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('end_date');
    }

    public function test_monthly_range_can_cross_year_and_is_limited_to_completed_twelve_months(): void
    {
        $this->actingAs($this->supervisor(), 'sanctum')
            ->getJson('/api/supervisor/team-scores/monthly?start_month=2025-10&end_month=2026-09')
            ->assertOk()
            ->assertJsonPath('period.start', '2025-10')
            ->assertJsonPath('period.end', '2026-09');

        $this->actingAs($this->supervisor(), 'sanctum')
            ->getJson('/api/supervisor/team-scores/monthly?start_month=2025-09&end_month=2026-09')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('end_month');

        $this->actingAs($this->supervisor(), 'sanctum')
            ->getJson('/api/supervisor/team-scores/monthly?start_month=2026-10&end_month=2026-10')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('end_month');
    }

    private function supervisor(): User
    {
        return User::where('username', 'spv-1')->firstOrFail();
    }
}

