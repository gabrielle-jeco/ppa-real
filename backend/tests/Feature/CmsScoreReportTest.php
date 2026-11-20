<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\CmsScoreReportService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CmsScoreReportTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'cache.default' => 'array',
        ]);
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        app('cache')->setDefaultDriver('array');
        $this->withoutMiddleware(ThrottleRequests::class);
        Carbon::setTestNow('2026-11-11 10:00:00');

        $this->createSchema();
        $this->seedData();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_daily_report_returns_summary_and_folded_supervisor_groups(): void
    {
        $response = $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/daily?regional=10&location=GBB&start=2026-11-01&end=2026-11-02');

        $response->assertOk()
            ->assertJsonPath('summary.total_employees', 6)
            ->assertJsonCount(1, 'summary.store_managers')
            ->assertJsonCount(2, 'summary.chief_operations')
            ->assertJsonPath('summary.supervisors', 1)
            ->assertJsonPath('summary.non_staff', 2)
            ->assertJsonCount(1, 'groups')
            ->assertJsonPath('groups.0.leader_id', 'spv-1')
            ->assertJsonPath('groups.0.subordinate_count', 2)
            ->assertJsonPath('groups.0.approved_tasks', 2)
            ->assertJsonPath('groups.0.unapproved_tasks', 2)
            ->assertJsonPath('groups.0.percentage', 50);
    }

    public function test_daily_group_details_are_loaded_for_the_selected_supervisor(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/daily/details?regional=10&location=GBB&location_id=GBB&leader_id=spv-1&start=2026-11-01&end=2026-11-02')
            ->assertOk()
            ->assertJsonCount(4, 'rows')
            ->assertJsonPath('rows.0.leader_id', 'spv-1');
    }

    public function test_a_crew_member_with_multiple_permanent_supervisors_appears_in_each_group(): void
    {
        DB::table('users')->insert([
            'username' => 'spv-2',
            'name' => 'Supervisor Dua',
            'initial_store' => 'GBB',
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('user_locations')->insert([
            'user_id' => 'spv-2',
            'location_id' => 'GBB',
            'job_level' => 'supervisor',
        ]);
        DB::table('reporting_lines')->insert([
            'leader_id' => 'spv-2',
            'subordinate_id' => 'crew-1',
            'status' => 'active',
            'relation_type' => 'permanent',
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/daily?regional=10&location=GBB&start=2026-11-01&end=2026-11-02')
            ->assertOk()
            ->assertJsonCount(2, 'groups')
            ->assertJsonPath('groups.0.leader_id', 'spv-2')
            ->assertJsonPath('groups.0.subordinate_count', 1);
    }

    public function test_monthly_report_reads_snapshot_components_for_service_crew(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/monthly?regional=10&location=GBB&start=2026-10&end=2026-10')
            ->assertOk()
            ->assertJsonCount(1, 'groups')
            ->assertJsonPath('groups.0.task_score', 80)
            ->assertJsonPath('groups.0.attendance_score', 90)
            ->assertJsonPath('groups.0.evaluation_score', 70)
            ->assertJsonPath('groups.0.percentage', 81);
    }

    public function test_report_rejects_daily_ranges_longer_than_thirty_one_days(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/daily?start=2026-10-01&end=2026-11-01')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('end');
    }

    public function test_report_requires_score_report_permission(): void
    {
        $role = Role::create(['name' => 'limited cms', 'permissions' => ['users_locations']]);
        $user = User::create([
            'username' => 'limited-admin',
            'name' => 'Limited Admin',
            'role_id' => $role->id,
            'active' => true,
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/cms/score-reports/daily?start=2026-11-01&end=2026-11-02')
            ->assertForbidden();
    }

    public function test_daily_report_can_be_exported_as_xlsx(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->get('/api/cms/score-reports/daily/export?regional=10&location=GBB&start=2026-11-01&end=2026-11-02')
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $rows = app(CmsScoreReportService::class)->exportRows('daily', [
            'location' => 'GBB',
            'regional' => null,
            'start' => '2026-11-01',
            'end' => '2026-11-02',
        ]);
        $this->assertCount(4, $rows);
        $crewRow = $rows->firstWhere('subordinate_id', 'crew-1');
        $this->assertNotNull($crewRow);
        $this->assertSame('spv-1', $crewRow['leader_id']);
    }

    public function test_report_uses_master_regional_branches_when_imported_region_code_differs(): void
    {
        DB::table('regional')->where('kode_regional', '10')->update(['kode_regional' => '001', 'cabang' => ' GBB, YPC ']);
        DB::table('locations')->insert(['initial' => 'YPC', 'name' => 'Yogya Plaza Cimahi', 'region_code' => 99, 'is_active' => true]);
        $locations = app(CmsScoreReportService::class)->locations(['regional' => '001']);
        $this->assertEqualsCanonicalizing(['GBB', 'YPC'], $locations->pluck('initial')->all());

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/daily?regional=001&location=GBB&start=2026-11-01&end=2026-11-02')
            ->assertOk()->assertJsonPath('summary.total_employees', 6)->assertJsonCount(1, 'groups');
        $this->get('/api/cms/score-reports/daily/export?regional=001&location=GBB&start=2026-11-01&end=2026-11-02')
            ->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertDatabaseHas('locations', ['initial' => 'GBB', 'region_code' => 10]);
    }

    public function test_legacy_numeric_region_matching_accepts_leading_zeroes(): void
    {
        DB::table('regional')->where('kode_regional', '10')->update(['kode_regional' => '001']);
        DB::table('locations')->where('initial', 'GBB')->update(['region_code' => 1]);
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/daily?regional=001&location=GBB&start=2026-11-01&end=2026-11-02')
            ->assertOk()->assertJsonCount(1, 'groups');
    }

    public function test_explicit_master_branch_list_does_not_expand_to_other_imported_locations(): void
    {
        $this->seedReportBranches();
        DB::table('regional')->where('kode_regional', '10')->update(['cabang' => 'YPC']);
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/daily?regional=10&location=GBB&start=2026-11-01&end=2026-11-02')
            ->assertUnprocessable()->assertJsonValidationErrors('location');
        $this->assertSame(['YPC'], app(CmsScoreReportService::class)->locations(['regional' => '10'])->pluck('initial')->all());
    }

    public function test_cms_must_choose_regional_and_branch_before_loading_report(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/daily?start=2026-11-01&end=2026-11-02')
            ->assertUnprocessable()->assertJsonValidationErrors(['regional', 'location']);
    }

    public function test_store_manager_and_chief_have_locked_scope_and_can_read_daily_monthly_and_excel(): void
    {
        foreach (['sm-1', 'co-1'] as $username) {
            $user = User::where('username', $username)->firstOrFail();
            $this->actingAs($user, 'sanctum')->getJson('/api/manager/score-reports/options')
                ->assertOk()->assertJsonPath('locked_regional', '10')->assertJsonPath('locked_location', 'GBB')
                ->assertJsonCount(1, 'locations');
            $this->getJson('/api/manager/score-reports/daily?start=2026-11-01&end=2026-11-02')
                ->assertOk()->assertJsonCount(1, 'groups')->assertJsonPath('summary.total_employees', 6);
            $this->getJson('/api/manager/score-reports/monthly?start=2026-10&end=2026-10')
                ->assertOk()->assertJsonCount(1, 'groups');
            $this->get('/api/manager/score-reports/daily/export?start=2026-11-01&end=2026-11-02')
                ->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        }
    }

    public function test_manager_cannot_override_branch_on_summary_details_or_export_even_with_extra_assignment(): void
    {
        $this->seedReportBranches();
        DB::table('user_locations')->insert(['user_id' => 'sm-1', 'location_id' => 'YPC', 'job_level' => 'manager']);
        $this->actingAs(User::where('username', 'sm-1')->firstOrFail(), 'sanctum');
        foreach (['daily', 'daily/details', 'daily/export'] as $path) {
            $this->getJson('/api/manager/score-reports/' . $path . '?regional=10&location=YPC&location_id=YPC&start=2026-11-01&end=2026-11-02')
                ->assertForbidden();
        }
        $this->getJson('/api/manager/score-reports/daily/details?location_id=YPC&start=2026-11-01&end=2026-11-02')->assertNotFound();
        $this->getJson('/api/cms/score-reports/daily?regional=10&location=YPC&start=2026-11-01&end=2026-11-02')->assertForbidden();
    }

    public function test_rm_can_only_choose_assigned_branches_inside_primary_regional(): void
    {
        $this->seedReportBranches();
        $rm = User::create(['username' => 'rm-1', 'name' => 'Regional Manager', 'initial_store' => 'GBB', 'active' => true]);
        foreach (['GBB', 'YPC', 'OUT'] as $branch) {
            DB::table('user_locations')->insert(['user_id' => $rm->username, 'location_id' => $branch, 'job_level' => 'regional_manager']);
        }
        $response = $this->actingAs($rm, 'sanctum')->getJson('/api/manager/score-reports/options')
            ->assertOk()->assertJsonPath('locked_regional', '10')->assertJsonPath('locked_location', null);
        $this->assertEqualsCanonicalizing(['GBB', 'YPC'], array_column($response->json('locations'), 'initial'));
        $this->getJson('/api/manager/score-reports/daily?start=2026-11-01&end=2026-11-02')
            ->assertUnprocessable()->assertJsonValidationErrors('location');
        $this->getJson('/api/manager/score-reports/daily?location=GBB&start=2026-11-01&end=2026-11-02')
            ->assertOk()->assertJsonCount(1, 'groups');
        $this->getJson('/api/manager/score-reports/daily?location=YPC&start=2026-11-01&end=2026-11-02')->assertOk();
        foreach (['FREE', 'OUT'] as $branch) {
            foreach (['daily', 'daily/details', 'daily/export'] as $path) {
                $this->getJson('/api/manager/score-reports/' . $path . '?location=' . $branch . '&location_id=' . $branch . '&start=2026-11-01&end=2026-11-02')
                    ->assertForbidden();
            }
        }
        $this->getJson('/api/manager/score-reports/daily?regional=20&location=OUT&start=2026-11-01&end=2026-11-02')->assertForbidden();
    }

    public function test_rm_primary_branch_must_be_an_explicit_assignment(): void
    {
        $this->seedReportBranches();
        $rm = User::create(['username' => 'rm-1', 'name' => 'Regional Manager', 'initial_store' => 'FREE', 'active' => true]);
        DB::table('user_locations')->insert(['user_id' => $rm->username, 'location_id' => 'GBB', 'job_level' => 'regional_manager']);
        $this->actingAs($rm, 'sanctum')->getJson('/api/manager/score-reports/options')
            ->assertUnprocessable()->assertJsonValidationErrors('location');
    }

    public function test_missing_or_ambiguous_primary_regional_returns_configuration_error(): void
    {
        $this->actingAs(User::where('username', 'sm-1')->firstOrFail(), 'sanctum');
        DB::table('regional')->delete();
        $this->getJson('/api/manager/score-reports/options')->assertUnprocessable()->assertJsonValidationErrors('regional');
        DB::table('regional')->insert([
            ['kode_regional' => '10', 'nama_regional' => 'First', 'cabang' => 'GBB'],
            ['kode_regional' => '20', 'nama_regional' => 'Second', 'cabang' => 'GBB'],
        ]);
        $this->getJson('/api/manager/score-reports/options')->assertUnprocessable()->assertJsonValidationErrors('regional');
    }

    public function test_report_denies_operational_crew_and_supervisor_access(): void
    {
        foreach (['spv-1', 'crew-1'] as $username) {
            $this->actingAs(User::where('username', $username)->firstOrFail(), 'sanctum');
            $this->getJson('/api/manager/score-reports/options')->assertForbidden();
            $this->getJson('/api/manager/score-reports/daily?regional=10&location=GBB&start=2026-11-01&end=2026-11-02')->assertForbidden();
        }
    }

    public function test_missing_snapshots_can_leave_report_empty_while_employee_summary_is_populated(): void
    {
        DB::table('daily_scores')->delete();
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/cms/score-reports/daily?regional=10&location=GBB&start=2026-11-01&end=2026-11-02')
            ->assertOk()->assertJsonPath('summary.total_employees', 6)->assertJsonCount(0, 'groups');
        $this->assertDatabaseCount('daily_scores', 0);
    }

    private function seedReportBranches(): void
    {
        DB::table('regional')->where('kode_regional', '10')->update(['cabang' => 'GBB, YPC, FREE']);
        DB::table('regional')->insert(['kode_regional' => '20', 'nama_regional' => 'Other Regional', 'cabang' => 'OUT']);
        DB::table('locations')->insert([
            ['initial' => 'YPC', 'name' => 'Yogya Plaza Cimahi', 'region_code' => 99, 'is_active' => true],
            ['initial' => 'FREE', 'name' => 'Unassigned Branch', 'region_code' => 10, 'is_active' => true],
            ['initial' => 'OUT', 'name' => 'Other Regional Branch', 'region_code' => 20, 'is_active' => true],
        ]);
    }

    private function admin(): User
    {
        return User::where('username', 'cms-admin')->firstOrFail();
    }

    private function seedData(): void
    {
        $role = Role::create([
            'name' => 'score report admin',
            'permissions' => ['score_reports'],
        ]);
        $storeManagerLevel = DB::table('job_levels')->insertGetId([
            'name' => 'STORE MANAGER',
            'position_code' => 'SM-OPR-CAB-OPR11',
        ]);
        $chiefLevel = DB::table('job_levels')->insertGetId([
            'name' => 'CHIEF OPERATION SUPERMARKET',
            'position_code' => 'CF-OPR-CAB-SPM3',
        ]);

        DB::table('locations')->insert([
            'initial' => 'GBB',
            'name' => 'GRIYA BUAH BATU',
            'region_code' => 10,
            'is_active' => true,
        ]);
        DB::table('regional')->insert(['kode_regional' => '10', 'nama_regional' => 'Bandung']);

        $users = [
            ['cms-admin', 'CMS Admin', null, null],
            ['sm-1', 'Store Manager Satu', $storeManagerLevel, 'manager'],
            ['co-1', 'Chief Operation Satu', $chiefLevel, 'manager'],
            ['co-2', 'Chief Operation Dua', $chiefLevel, 'manager'],
            ['spv-1', 'Supervisor Satu', null, 'supervisor'],
            ['crew-1', 'Crew Satu', null, 'sc'],
            ['crew-2', 'Crew Dua', null, 'sc'],
        ];

        foreach ($users as [$username, $name, $jobLevelId, $appLevel]) {
            DB::table('users')->insert([
                'username' => $username,
                'name' => $name,
                'role_id' => $username === 'cms-admin' ? $role->id : null,
                'job_level_id' => $jobLevelId,
                'initial_store' => $username === 'cms-admin' ? null : 'GBB',
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            if ($appLevel) {
                DB::table('user_locations')->insert([
                    'user_id' => $username,
                    'location_id' => 'GBB',
                    'job_level' => $appLevel,
                ]);
            }
        }

        DB::table('reporting_lines')->insert([
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-1', 'status' => 'active', 'relation_type' => 'permanent'],
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-2', 'status' => 'active', 'relation_type' => 'permanent'],
        ]);

        foreach (['2026-11-01', '2026-11-02'] as $date) {
            DB::table('daily_scores')->insert([
                ['user_id' => 'crew-1', 'score_date' => $date, 'score' => 100, 'approved_tasks' => 1, 'unapproved_tasks' => 0],
                ['user_id' => 'crew-2', 'score_date' => $date, 'score' => 0, 'approved_tasks' => 0, 'unapproved_tasks' => 1],
            ]);
        }

        foreach (['crew-1', 'crew-2'] as $crew) {
            DB::table('monthly_overall_scores')->insert([
                'user_id' => $crew,
                'period' => '2026-10-01',
                'final_score' => 81,
                'details' => json_encode([
                    'task_score' => 80,
                    'attendance_score' => 90,
                    'personality_score' => 70,
                ]),
            ]);
        }
    }

    private function createSchema(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->json('permissions')->nullable();
            $table->timestamps();
        });
        Schema::create('job_levels', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('position_code')->nullable();
        });
        Schema::create('locations', function (Blueprint $table) {
            $table->string('initial')->primary();
            $table->string('name');
            $table->integer('region_code')->nullable();
            $table->boolean('is_active')->default(true);
        });
        Schema::create('regional', function (Blueprint $table) {
            $table->id();
            $table->string('kode_regional')->unique();
            $table->string('nama_regional');
            $table->string('cabang')->nullable();
        });
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->unique();
            $table->string('name');
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
            $table->string('location_id');
            $table->string('job_level')->nullable();
        });
        Schema::create('reporting_lines', function (Blueprint $table) {
            $table->id();
            $table->string('leader_id');
            $table->string('subordinate_id');
            $table->string('status')->default('active');
            $table->string('relation_type')->default('permanent');
        });
        Schema::create('daily_scores', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('score_date');
            $table->string('category')->default('service_crew');
            $table->decimal('score', 5, 2)->nullable();
            $table->unsignedInteger('approved_tasks')->default(0);
            $table->unsignedInteger('unapproved_tasks')->default(0);
        });
        Schema::create('monthly_overall_scores', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('period');
            $table->integer('final_score');
            $table->json('details')->nullable();
        });
    }
}
