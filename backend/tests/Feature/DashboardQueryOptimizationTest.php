<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ScoringService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DashboardQueryOptimizationTest extends TestCase
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

        $this->createSchema();
        Carbon::setTestNow(Carbon::parse('2026-10-10 13:00:00', 'Asia/Jakarta'));
        $this->seedDataset();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_capture_and_verify_n1_to_n5_parity_and_query_counts(): void
    {
        $rm = User::where('username', 'rm-1')->firstOrFail();
        $spv1 = User::where('username', 'spv-1')->firstOrFail();
        $scoring = app(ScoringService::class);

        // N1a: GET /api/manager/supervisors
        [$resN1a, $qN1a] = $this->measureQueries(fn () => $this->actingAs($rm, 'sanctum')
            ->getJson('/api/manager/supervisors')
            ->assertOk()
            ->json());

        // N1b-mgr: GET /api/manager/supervisors/spv-1/stats
        [$resN1bMgr, $qN1bMgr] = $this->measureQueries(fn () => $this->actingAs($rm, 'sanctum')
            ->getJson('/api/manager/supervisors/spv-1/stats?month=10&year=2026&day=10')
            ->assertOk()
            ->json());

        // N1b-spv: GET /api/supervisor/stats
        [$resN1bSpv, $qN1bSpv] = $this->measureQueries(fn () => $this->actingAs($spv1, 'sanctum')
            ->getJson('/api/supervisor/stats?month=10&year=2026')
            ->assertOk()
            ->json());

        // N2: GET /api/supervisor/crews
        [$resN2, $qN2] = $this->measureQueries(fn () => $this->actingAs($spv1, 'sanctum')
            ->getJson('/api/supervisor/crews')
            ->assertOk()
            ->json());

        // N3: GET /api/supervisor/dashboard-summary
        [$resN3, $qN3] = $this->measureQueries(fn () => $this->actingAs($spv1, 'sanctum')
            ->getJson('/api/supervisor/dashboard-summary?date=2026-10-10')
            ->assertOk()
            ->json());

        // N4: GET /api/manager/supervisors/spv-1/crews
        [$resN4, $qN4] = $this->measureQueries(fn () => $this->actingAs($rm, 'sanctum')
            ->getJson('/api/manager/supervisors/spv-1/crews?date=2026-10-10')
            ->assertOk()
            ->json());

        // N5a: GET /api/supervisor/team-scores/daily
        [$resN5a, $qN5a] = $this->measureQueries(fn () => $this->actingAs($spv1, 'sanctum')
            ->getJson('/api/supervisor/team-scores/daily?start_date=2026-10-01&end_date=2026-10-10')
            ->assertOk()
            ->json());

        // N5b: GET /api/supervisor/team-scores/monthly
        [$resN5b, $qN5b] = $this->measureQueries(fn () => $this->actingAs($spv1, 'sanctum')
            ->getJson('/api/supervisor/team-scores/monthly?start_month=2026-07&end_month=2026-09')
            ->assertOk()
            ->json());

        // Assert exact scoring parity with single-entity ScoringService calculations
        $spv1SingleStats = $scoring->getSupervisorMonthlyDetailedScore($spv1, Carbon::parse('2026-10-10'));
        $spv1Row = collect($resN1a['supervisors'])->firstWhere('id', 'spv-1');
        $this->assertSame($spv1SingleStats['my_avg_point'], $spv1Row['score']);
        $this->assertSame($spv1SingleStats, $resN1bMgr);
        $this->assertSame($scoring->getSupervisorMonthlyDetailedScore($spv1, Carbon::parse('2026-10-01')), $resN1bSpv);

        // Verify spv-1 crews (5 permanent + 1 active backup = 6, expired excluded)
        $crewIdsInN2 = collect($resN2['crews'])->pluck('id')->all();
        $this->assertContains('crew-bkp-active', $crewIdsInN2);
        $this->assertNotContains('crew-bkp-expired', $crewIdsInN2);
        $this->assertCount(6, $crewIdsInN2);

        foreach ($resN2['crews'] as $crewRow) {
            $crewModel = User::where('username', $crewRow['id'])->firstOrFail();
            $singleMonthly = $scoring->getCrewMonthlyDetailedStats($crewModel, Carbon::now());
            $singleDaily = $scoring->getCrewDailyScoreDisplay($crewModel, Carbon::today());
            $this->assertSame($singleMonthly['active_percentage'], $crewRow['score']);
            $this->assertSame($singleDaily['score'], $crewRow['daily_score']);
            $this->assertSame($singleDaily['available'], $crewRow['daily_score_available']);
            $this->assertSame($singleDaily['unavailable_reason'], $crewRow['daily_score_unavailable_reason']);
        }

        // Edge case checks in N2
        $crew1Row = collect($resN2['crews'])->firstWhere('id', 'crew-s1-1');
        $this->assertSame('Kassa', $crew1Row['current_workstation']);
        $this->assertSame(50.0, (float) $crew1Row['task_progress']); // 1 approved of 2 reviewable tasks

        $crew2Row = collect($resN2['crews'])->firstWhere('id', 'crew-s1-2');
        $this->assertSame('non_working_day', $crew2Row['daily_score_unavailable_reason']);

        $crew3Row = collect($resN2['crews'])->firstWhere('id', 'crew-s1-3');
        $this->assertSame('attendance_missing', $crew3Row['daily_score_unavailable_reason']);

        $crew4Row = collect($resN2['crews'])->firstWhere('id', 'crew-s1-4');
        $this->assertTrue($crew4Row['daily_score_available']);
        $this->assertSame(100, $crew4Row['daily_score']);

        $crewBkpRow = collect($resN2['crews'])->firstWhere('id', 'crew-bkp-active');
        $this->assertTrue($crewBkpRow['has_tasks']);
        $this->assertSame(100.0, (float) $crewBkpRow['task_progress']); // only spv-2's approved task is reviewable

        // Verify N3 parity
        $this->assertSame(6, $resN3['cards']['unassigned_crews']['total']);
        $this->assertCount(1, $resN3['pending_approvals']);
        $this->assertSame('Task Pending Review', $resN3['pending_approvals'][0]['title']);

        // Verify N4 parity (Manager Crew Tasks uses permanent active crews and targetDate)
        $this->assertCount(6, $resN4['crews']);
        foreach ($resN4['crews'] as $crewRow) {
            $crewModel = User::where('username', $crewRow['id'])->firstOrFail();
            $singleMonthly = $scoring->getCrewMonthlyDetailedStats($crewModel, Carbon::parse('2026-10-10'));
            $singleDaily = $scoring->getCrewDailyScoreDisplay($crewModel, Carbon::parse('2026-10-10'));
            $this->assertSame($singleMonthly['active_percentage'], $crewRow['activity_percentage']);
            $this->assertSame($singleDaily['score'], $crewRow['daily_score']);
        }

        // Verify N5a & N5b parity (permanent team only, 5 crews, sorted naturally)
        $this->assertCount(5, $resN5a['members']);
        $this->assertCount(5, $resN5b['members']);
        foreach ($resN5a['members'] as $memberRow) {
            $crewModel = User::where('username', $memberRow['id'])->firstOrFail();
            $expected = $scoring->getCrewDailyReport($crewModel, Carbon::parse('2026-10-01'), Carbon::parse('2026-10-10'))['summary'];
            $this->assertSame($expected['approved_tasks'], $memberRow['approved_tasks']);
            $this->assertSame($expected['unapproved_tasks'], $memberRow['unapproved_tasks']);
            $this->assertEquals($expected['score'], $memberRow['score']);
            $this->assertSame($expected['available_days'], $memberRow['available_days']);
        }
        foreach ($resN5b['members'] as $memberRow) {
            $crewModel = User::where('username', $memberRow['id'])->firstOrFail();
            $expected = $scoring->getCrewMonthlyReport($crewModel, Carbon::parse('2026-07-01'), Carbon::parse('2026-09-01'))['summary'];
            $this->assertEquals($expected['task_score'], $memberRow['task_score']);
            $this->assertEquals($expected['attendance_score'], $memberRow['attendance_score']);
            $this->assertEquals($expected['evaluation_score'], $memberRow['evaluation_score']);
            $this->assertEquals($expected['total_score'], $memberRow['total_score']);
        }

        // Verify past-month targetDate behavior on N1b and N4
        $pastStats = $this->actingAs($rm, 'sanctum')
            ->getJson('/api/manager/supervisors/spv-1/stats?month=9&year=2026&day=15')
            ->assertOk()
            ->json();
        $this->assertSame(
            $scoring->getSupervisorMonthlyDetailedScore($spv1, Carbon::parse('2026-09-15')),
            $pastStats
        );

        // Assert bounded O(1) query counts across all N1-N5 endpoints
        $this->assertLessThanOrEqual(15, $qN1a, 'N1a manager supervisors queries exceeded bound');
        $this->assertLessThanOrEqual(20, $qN1bMgr, 'N1b manager supervisor stats queries exceeded bound');
        $this->assertLessThanOrEqual(16, $qN1bSpv, 'N1b supervisor stats queries exceeded bound');
        $this->assertLessThanOrEqual(20, $qN2, 'N2 supervisor crews queries exceeded bound');
        $this->assertLessThanOrEqual(17, $qN3, 'N3 supervisor dashboard summary queries exceeded bound');
        $this->assertLessThanOrEqual(25, $qN4, 'N4 manager crew tasks queries exceeded bound');
        $this->assertLessThanOrEqual(10, $qN5a, 'N5a team daily scores queries exceeded bound');
        $this->assertLessThanOrEqual(11, $qN5b, 'N5b team monthly scores queries exceeded bound');
    }

    public function test_query_counts_remain_constant_when_supervisors_and_crews_grow(): void
    {
        [, $baseN1a] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'rm-1')->firstOrFail(), 'sanctum')->getJson('/api/manager/supervisors')->assertOk());
        [, $baseN2] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'spv-1')->firstOrFail(), 'sanctum')->getJson('/api/supervisor/crews')->assertOk());
        [, $baseN3] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'spv-1')->firstOrFail(), 'sanctum')->getJson('/api/supervisor/dashboard-summary?date=2026-10-10')->assertOk());
        [, $baseN4] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'rm-1')->firstOrFail(), 'sanctum')->getJson('/api/manager/supervisors/spv-1/crews?date=2026-10-10')->assertOk());
        [, $baseN5a] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'spv-1')->firstOrFail(), 'sanctum')->getJson('/api/supervisor/team-scores/daily?start_date=2026-10-01&end_date=2026-10-10')->assertOk());
        [, $baseN5b] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'spv-1')->firstOrFail(), 'sanctum')->getJson('/api/supervisor/team-scores/monthly?start_month=2026-07&end_month=2026-09')->assertOk());

        $userRoleId = DB::table('roles')->where('name', 'user')->value('id');
        $spvLevelId = DB::table('job_levels')->where('name', 'supervisor')->value('id');
        $crewLevelId = DB::table('job_levels')->where('name', 'crew')->value('id');

        // Add 3 more supervisors and 5 extra permanent crews under spv-1
        for ($s = 6; $s <= 8; $s++) {
            DB::table('users')->insert([
                'username' => "spv-{$s}",
                'name' => "Supervisor {$s}",
                'role_id' => $userRoleId,
                'job_level_id' => $spvLevelId,
                'initial_store' => 'LOCA',
                'active' => true,
            ]);
            DB::table('user_locations')->insert(['user_id' => "spv-{$s}", 'location_id' => 'LOCA', 'job_level' => 'supervisor']);
            DB::table('reporting_lines')->insert(['leader_id' => 'rm-1', 'subordinate_id' => "spv-{$s}", 'status' => 'active', 'relation_type' => 'permanent']);
        }

        for ($c = 6; $c <= 10; $c++) {
            $crewId = "crew-s1-{$c}";
            DB::table('users')->insert([
                'username' => $crewId,
                'name' => "Crew 1-{$c}",
                'role_id' => $userRoleId,
                'job_level_id' => $crewLevelId,
                'initial_store' => 'LOCA',
                'active' => true,
            ]);
            DB::table('user_locations')->insert(['user_id' => $crewId, 'location_id' => 'LOCA', 'job_level' => 'sc']);
            DB::table('reporting_lines')->insert(['leader_id' => 'spv-1', 'subordinate_id' => $crewId, 'status' => 'active', 'relation_type' => 'permanent']);
            DB::table('attendances')->insert(['user_id' => $crewId, 'date' => '2026-10-10', 'status_code' => 'H']);
            DB::table('tasks')->insert([
                'employee_id' => $crewId,
                'employer_id' => 'spv-1',
                'title' => "Extra Task {$crewId}",
                'start_at' => '2026-10-10 08:00:00',
                'due_at' => '2026-10-10 17:00:00',
                'status' => 'approved',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        [, $scaledN1a] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'rm-1')->firstOrFail(), 'sanctum')->getJson('/api/manager/supervisors')->assertOk());
        [, $scaledN2] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'spv-1')->firstOrFail(), 'sanctum')->getJson('/api/supervisor/crews')->assertOk());
        [, $scaledN3] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'spv-1')->firstOrFail(), 'sanctum')->getJson('/api/supervisor/dashboard-summary?date=2026-10-10')->assertOk());
        [, $scaledN4] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'rm-1')->firstOrFail(), 'sanctum')->getJson('/api/manager/supervisors/spv-1/crews?date=2026-10-10')->assertOk());
        [, $scaledN5a] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'spv-1')->firstOrFail(), 'sanctum')->getJson('/api/supervisor/team-scores/daily?start_date=2026-10-01&end_date=2026-10-10')->assertOk());
        [, $scaledN5b] = $this->measureQueries(fn () => $this->actingAs(User::where('username', 'spv-1')->firstOrFail(), 'sanctum')->getJson('/api/supervisor/team-scores/monthly?start_month=2026-07&end_month=2026-09')->assertOk());

        $this->assertSame($baseN1a, $scaledN1a);
        $this->assertSame($baseN2, $scaledN2);
        $this->assertSame($baseN3, $scaledN3);
        $this->assertSame($baseN4, $scaledN4);
        $this->assertSame($baseN5a, $scaledN5a);
        $this->assertSame($baseN5b, $scaledN5b);
    }

    private function measureQueries(callable $callback): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        try {
            $result = $callback();
            $count = count(DB::getQueryLog());
        } finally {
            DB::disableQueryLog();
        }

        return [$result, $count];
    }

    private function createSchema(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('description')->nullable();
            $table->json('permissions')->nullable();
            $table->timestamps();
        });
        Schema::create('job_levels', function (Blueprint $table) {
            $table->id();
            $table->string('position_code')->nullable();
            $table->string('name');
            $table->string('grade')->nullable();
            $table->boolean('visible_in_yodaily')->default(true);
            $table->timestamps();
        });
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('initial')->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->unique();
            $table->string('name');
            $table->string('password')->nullable();
            $table->unsignedBigInteger('role_id')->nullable();
            $table->unsignedBigInteger('job_level_id')->nullable();
            $table->string('initial_store')->nullable();
            $table->boolean('active')->default(true);
            $table->boolean('is_back_office')->default(false);
            $table->timestamps();
        });
        Schema::create('user_locations', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('location_id')->nullable();
            $table->string('job_level')->nullable();
            $table->timestamps();
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
            $table->timestamps();
        });
        $this->createBackupTables();
        Schema::create('work_stations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->json('guide_content')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('task_areas', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('work_station_id');
            $table->string('name');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('task_definitions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_area_id');
            $table->string('title');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('employee_id');
            $table->string('employer_id');
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->unsignedBigInteger('task_definition_id')->nullable();
            $table->unsignedBigInteger('assignment_batch_id')->nullable();
            $table->string('assignment_type')->default('individual');
            $table->string('title');
            $table->text('description')->nullable();
            $table->dateTime('start_at')->nullable();
            $table->dateTime('due_at');
            $table->dateTime('approval_deadline_at')->nullable();
            $table->dateTime('revision_deadline_at')->nullable();
            $table->string('status')->default('pending');
            $table->timestamps();
        });
        Schema::create('task_evidences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->string('file_path')->nullable();
            $table->string('type');
            $table->unsignedTinyInteger('attempt_no')->nullable();
            $table->string('review_status')->nullable();
            $table->decimal('awarded_score', 5, 2)->nullable();
            $table->timestamps();
        });
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('date');
            $table->string('status_code')->nullable();
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
        Schema::create('monthly_overall_scores', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('period');
            $table->integer('final_score');
            $table->json('details')->nullable();
            $table->timestamps();
        });
        Schema::create('guide_reads', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->unsignedBigInteger('work_station_id');
            $table->date('read_date');
            $table->timestamps();
        });
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->string('action')->default('switch_station');
            $table->timestamps();
        });
        Schema::create('scoring_rules', function (Blueprint $table) {
            $table->id();
            $table->date('effective_from')->unique();
            $table->decimal('task_weight', 6, 3)->default(60);
            $table->decimal('attendance_weight', 6, 3)->default(25);
            $table->decimal('evaluation_weight', 6, 3)->default(15);
            $table->unsignedSmallInteger('attendance_target')->default(25);
            $table->json('attendance_included_statuses');
            $table->json('task_excluded_statuses');
            $table->decimal('cashier_task_weight', 7, 4)->default(33.3333);
            $table->decimal('cashier_ibop_weight', 7, 4)->default(33.3333);
            $table->decimal('cashier_push_selling_weight', 7, 4)->default(33.3334);
            $table->string('created_by')->nullable();
            $table->timestamps();
        });
    }

    private function seedDataset(): void
    {
        $userRoleId = DB::table('roles')->insertGetId([
            'name' => 'user',
            'description' => 'Operational user',
            'permissions' => json_encode([]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $rmLevelId = DB::table('job_levels')->insertGetId(['name' => 'regional_manager', 'grade' => 'RM']);
        $spvLevelId = DB::table('job_levels')->insertGetId(['name' => 'supervisor', 'grade' => 'SPV']);
        $crewLevelId = DB::table('job_levels')->insertGetId(['name' => 'crew', 'grade' => 'SC']);

        DB::table('locations')->insert([
            ['initial' => 'LOCA', 'name' => 'Cabang A', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['initial' => 'LOCB', 'name' => 'Cabang B', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);

        DB::table('scoring_rules')->insert([
            'effective_from' => '2026-01-01',
            'task_weight' => 60,
            'attendance_weight' => 25,
            'evaluation_weight' => 15,
            'attendance_target' => 25,
            'attendance_included_statuses' => json_encode(['H', 'O', 'OP', 'CT']),
            'task_excluded_statuses' => json_encode(['O', 'OP', 'CT']),
            'cashier_task_weight' => 33.3333,
            'cashier_ibop_weight' => 33.3333,
            'cashier_push_selling_weight' => 33.3334,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $wsId = DB::table('work_stations')->insertGetId(['name' => 'Kassa', 'active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $areaId = DB::table('task_areas')->insertGetId(['work_station_id' => $wsId, 'name' => 'Front', 'sort_order' => 0, 'active' => true]);
        $defId = DB::table('task_definitions')->insertGetId(['task_area_id' => $areaId, 'title' => 'Clean', 'sort_order' => 0, 'active' => true]);

        DB::table('users')->insert([
            'username' => 'rm-1',
            'name' => 'Regional Manager',
            'role_id' => $userRoleId,
            'job_level_id' => $rmLevelId,
            'initial_store' => 'LOCA',
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('user_locations')->insert([
            ['user_id' => 'rm-1', 'location_id' => 'LOCA', 'job_level' => 'regional_manager'],
            ['user_id' => 'rm-1', 'location_id' => 'LOCB', 'job_level' => 'regional_manager'],
        ]);

        for ($s = 1; $s <= 5; $s++) {
            $spvId = "spv-{$s}";
            $loc = $s <= 3 ? 'LOCA' : 'LOCB';

            DB::table('users')->insert([
                'username' => $spvId,
                'name' => "Supervisor {$s}",
                'role_id' => $userRoleId,
                'job_level_id' => $spvLevelId,
                'initial_store' => $loc,
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('user_locations')->insert(['user_id' => $spvId, 'location_id' => $loc, 'job_level' => 'supervisor']);
            DB::table('reporting_lines')->insert([
                'leader_id' => 'rm-1',
                'subordinate_id' => $spvId,
                'status' => 'active',
                'relation_type' => 'permanent',
            ]);
            DB::table('attendances')->insert([
                ['user_id' => $spvId, 'date' => '2026-10-10', 'status_code' => 'H'],
                ['user_id' => $spvId, 'date' => '2026-09-15', 'status_code' => 'H'],
            ]);
            DB::table('monthly_personality_evaluations')->insert([
                ['evaluatee_id' => $spvId, 'evaluator_id' => 'rm-1', 'evaluation_period' => '2026-10-01', 'evaluation_type' => 'manager_review', 'score' => 80, 'created_at' => now(), 'updated_at' => now()],
                ['evaluatee_id' => $spvId, 'evaluator_id' => 'rm-2', 'evaluation_period' => '2026-10-01', 'evaluation_type' => 'manager_review', 'score' => 90, 'created_at' => now(), 'updated_at' => now()],
                ['evaluatee_id' => $spvId, 'evaluator_id' => 'rm-1', 'evaluation_period' => '2026-09-01', 'evaluation_type' => 'manager_review', 'score' => 88, 'created_at' => now(), 'updated_at' => now()],
            ]);

            for ($c = 1; $c <= 5; $c++) {
                $crewId = "crew-s{$s}-{$c}";
                DB::table('users')->insert([
                    'username' => $crewId,
                    'name' => "Crew {$s}-{$c}",
                    'role_id' => $userRoleId,
                    'job_level_id' => $crewLevelId,
                    'initial_store' => $loc,
                    'active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                DB::table('user_locations')->insert(['user_id' => $crewId, 'location_id' => $loc, 'job_level' => 'sc']);
                DB::table('reporting_lines')->insert([
                    'leader_id' => $spvId,
                    'subordinate_id' => $crewId,
                    'status' => 'active',
                    'relation_type' => 'permanent',
                ]);

                // Historical attendances & personality evals for Jul-Sep + Oct 1-9
                foreach (['2026-07-05', '2026-08-05', '2026-09-15', '2026-10-01', '2026-10-05'] as $d) {
                    DB::table('attendances')->insert(['user_id' => $crewId, 'date' => $d, 'status_code' => 'H']);
                }
                foreach (['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'] as $p) {
                    DB::table('monthly_personality_evaluations')->insert([
                        ['evaluatee_id' => $crewId, 'evaluator_id' => $spvId, 'evaluation_period' => $p, 'evaluation_type' => 'personality', 'score' => 80, 'created_at' => now(), 'updated_at' => now()],
                        ['evaluatee_id' => $crewId, 'evaluator_id' => 'spv-backup-eval', 'evaluation_period' => $p, 'evaluation_type' => 'personality', 'score' => 90, 'created_at' => now(), 'updated_at' => now()],
                    ]);
                }

                // Today's edge cases for spv-1
                if ($s === 1 && $c === 2) {
                    DB::table('attendances')->insert(['user_id' => $crewId, 'date' => '2026-10-10', 'status_code' => 'O']);
                } elseif ($s === 1 && ($c === 3 || $c === 4)) {
                    // Leave 2026-10-10 attendance missing intentionally
                } else {
                    DB::table('attendances')->insert(['user_id' => $crewId, 'date' => '2026-10-10', 'status_code' => 'H']);
                }

                // Historical task in Sep
                $sepTaskId = DB::table('tasks')->insertGetId([
                    'employee_id' => $crewId,
                    'employer_id' => $spvId,
                    'work_station_id' => $wsId,
                    'task_definition_id' => $defId,
                    'title' => 'Task Sep',
                    'start_at' => '2026-09-15 08:00:00',
                    'due_at' => '2026-09-15 17:00:00',
                    'status' => 'approved',
                    'created_at' => '2026-09-15 08:00:00',
                    'updated_at' => '2026-09-15 09:00:00',
                ]);
                DB::table('task_evidences')->insert([
                    ['task_id' => $sepTaskId, 'type' => 'before'],
                    ['task_id' => $sepTaskId, 'type' => 'after'],
                ]);

                // Today tasks (skip crew-s1-3 & crew-s1-5 so they have no tasks today)
                if (!($s === 1 && ($c === 3 || $c === 5))) {
                    $tId = DB::table('tasks')->insertGetId([
                        'employee_id' => $crewId,
                        'employer_id' => $spvId,
                        'work_station_id' => $wsId,
                        'task_definition_id' => $defId,
                        'title' => "Task Approved {$crewId}",
                        'start_at' => '2026-10-10 08:00:00',
                        'due_at' => '2026-10-10 17:00:00',
                        'status' => 'approved',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    DB::table('task_evidences')->insert([
                        ['task_id' => $tId, 'type' => 'before'],
                        ['task_id' => $tId, 'type' => 'after'],
                    ]);
                }

                if ($s === 1 && $c === 1) {
                    $pendingId = DB::table('tasks')->insertGetId([
                        'employee_id' => $crewId,
                        'employer_id' => $spvId,
                        'work_station_id' => $wsId,
                        'task_definition_id' => $defId,
                        'title' => 'Task Pending Review',
                        'start_at' => '2026-10-10 09:00:00',
                        'due_at' => '2026-10-10 18:00:00',
                        'status' => 'pending',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    DB::table('task_evidences')->insert([
                        ['task_id' => $pendingId, 'type' => 'before'],
                        ['task_id' => $pendingId, 'type' => 'after'],
                    ]);
                    DB::table('activity_logs')->insert([
                        'user_id' => $crewId,
                        'work_station_id' => $wsId,
                        'action' => 'switch_station',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    DB::table('guide_reads')->insert([
                        'user_id' => $crewId,
                        'work_station_id' => $wsId,
                        'read_date' => '2026-10-10',
                    ]);
                }
            }
        }

        // Active backup crew for spv-1 (from spv-2) + expired backup crew (from spv-3)
        DB::table('users')->insert([
            [
                'username' => 'crew-bkp-active',
                'name' => 'Crew Backup Active',
                'role_id' => $userRoleId,
                'job_level_id' => $crewLevelId,
                'initial_store' => 'LOCA',
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'username' => 'crew-bkp-expired',
                'name' => 'Crew Backup Expired',
                'role_id' => $userRoleId,
                'job_level_id' => $crewLevelId,
                'initial_store' => 'LOCA',
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
        DB::table('user_locations')->insert([
            ['user_id' => 'crew-bkp-active', 'location_id' => 'LOCA', 'job_level' => 'sc'],
            ['user_id' => 'crew-bkp-expired', 'location_id' => 'LOCA', 'job_level' => 'sc'],
        ]);
        DB::table('reporting_lines')->insert([
            ['leader_id' => 'spv-2', 'subordinate_id' => 'crew-bkp-active', 'status' => 'active', 'relation_type' => 'permanent'],
            ['leader_id' => 'spv-3', 'subordinate_id' => 'crew-bkp-expired', 'status' => 'active', 'relation_type' => 'permanent'],
        ]);
        $activeReqId = DB::table('supervisor_backup_requests')->insertGetId([
            'requester_id' => 'spv-2',
            'backup_supervisor_id' => 'spv-1',
            'start_date' => '2026-10-01',
            'end_date' => '2026-10-31',
            'status' => 'approved',
        ]);
        $expiredReqId = DB::table('supervisor_backup_requests')->insertGetId([
            'requester_id' => 'spv-3',
            'backup_supervisor_id' => 'spv-1',
            'start_date' => '2026-10-01',
            'end_date' => '2026-10-05',
            'status' => 'approved',
        ]);
        DB::table('supervisor_backup_assignments')->insert([
            ['backup_request_id' => $activeReqId, 'subordinate_id' => 'crew-bkp-active'],
            ['backup_request_id' => $expiredReqId, 'subordinate_id' => 'crew-bkp-expired'],
        ]);
        DB::table('reporting_lines')->insert([
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-bkp-active', 'status' => 'active', 'relation_type' => 'backup', 'backup_request_id' => $activeReqId, 'effective_from' => '2026-10-01', 'effective_until' => '2026-10-31'],
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-bkp-expired', 'status' => 'active', 'relation_type' => 'backup', 'backup_request_id' => $expiredReqId, 'effective_from' => '2026-10-01', 'effective_until' => '2026-10-05'],
        ]);
        DB::table('attendances')->insert(['user_id' => 'crew-bkp-active', 'date' => '2026-10-10', 'status_code' => 'H']);
        $bkpAllowedTaskId = DB::table('tasks')->insertGetId([
            'employee_id' => 'crew-bkp-active',
            'employer_id' => 'spv-2',
            'work_station_id' => $wsId,
            'task_definition_id' => $defId,
            'title' => 'Backup Task Allowed',
            'start_at' => '2026-10-10 08:00:00',
            'due_at' => '2026-10-10 17:00:00',
            'status' => 'approved',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('task_evidences')->insert([
            ['task_id' => $bkpAllowedTaskId, 'type' => 'before'],
            ['task_id' => $bkpAllowedTaskId, 'type' => 'after'],
        ]);
        DB::table('tasks')->insert([
            'employee_id' => 'crew-bkp-active',
            'employer_id' => 'spv-3',
            'work_station_id' => $wsId,
            'task_definition_id' => $defId,
            'title' => 'Unrelated SPV Task',
            'start_at' => '2026-10-10 08:00:00',
            'due_at' => '2026-10-10 17:00:00',
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
