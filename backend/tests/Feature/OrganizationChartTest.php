<?php

namespace Tests\Feature;

use App\Models\JobLevel;
use App\Models\ReportingLine;
use App\Models\Role;
use App\Models\User;
use App\Models\UserLocation;
use App\Services\ManagerScopeService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class OrganizationChartTest extends TestCase
{
    private Role $adminRole;
    private array $jobLevels = [];

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

        $this->adminRole = Role::create([
            'name' => 'organigram-admin',
            'permissions' => ['reporting_lines'],
        ]);
        DB::table('locations')->insert(['initial' => 'GBB', 'name' => 'Griya Buah Batu', 'created_at' => now(), 'updated_at' => now()]);
        $this->jobLevels = [
            'sm' => JobLevel::create(['position_code' => 'SM-OPR-CAB-OPR11', 'name' => 'STORE MANAGER', 'grade' => 'MGR', 'visible_in_yodaily' => true]),
            'co' => JobLevel::create(['position_code' => 'CF-OPR-CAB-FSH1', 'name' => 'CHIEF OPERATION FASHION', 'grade' => 'CHF', 'visible_in_yodaily' => true]),
            'spv' => JobLevel::create(['position_code' => 'ST-OPR-CAB-FSH17', 'name' => 'SUPERVISOR FASHION', 'grade' => 'STF', 'visible_in_yodaily' => true]),
            'sc' => JobLevel::create(['position_code' => 'THL', 'name' => 'THL', 'grade' => 'THL', 'visible_in_yodaily' => true]),
        ];
    }

    protected function tearDown(): void
    {
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_chart_supports_full_and_direct_supervisor_paths(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $co = $this->createUser('co-1', 'Chief Operation', 'co', 'manager');
        $spvUnderCo = $this->createUser('spv-1', 'Supervisor CO', 'spv', 'supervisor');
        $spvDirect = $this->createUser('spv-2', 'Supervisor Langsung', 'spv', 'supervisor');
        $crew = $this->createUser('crew-1', 'Crew', 'sc', 'sc');
        $candidate = $this->createUser('crew-2', 'Crew Candidate', 'sc', 'sc');

        $this->line($sm, $co);
        $this->line($co, $spvUnderCo);
        $this->line($sm, $spvDirect);
        $this->line($spvUnderCo, $crew);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/organization-chart?location_id=GBB')
            ->assertOk()
            ->assertJsonCount(5, 'nodes')
            ->assertJsonCount(4, 'edges')
            ->assertJsonFragment(['username' => $candidate->username, 'name' => $candidate->name]);
    }

    public function test_invalid_hierarchy_is_rejected_by_shared_rules(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $co = $this->createUser('co-1', 'Chief Operation', 'co', 'manager');
        $crew = $this->createUser('crew-1', 'Crew', 'sc', 'sc');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/organization-chart/relations', [
                'location_id' => 'GBB',
                'leader_id' => $co->username,
                'subordinate_id' => $crew->username,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('leader_id');
    }

    public function test_multiple_permanent_leaders_are_preserved(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $co = $this->createUser('co-1', 'Chief Operation', 'co', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');

        $this->actingAs($admin, 'sanctum')->postJson('/api/organization-chart/relations', [
            'location_id' => 'GBB', 'leader_id' => $sm->username, 'subordinate_id' => $spv->username,
        ])->assertCreated();
        $this->actingAs($admin, 'sanctum')->postJson('/api/organization-chart/relations', [
            'location_id' => 'GBB', 'leader_id' => $co->username, 'subordinate_id' => $spv->username,
        ])->assertCreated();

        $this->assertDatabaseHas('reporting_lines', ['leader_id' => $sm->username, 'subordinate_id' => $spv->username, 'status' => 'active']);
        $this->assertDatabaseHas('reporting_lines', ['leader_id' => $co->username, 'subordinate_id' => $spv->username, 'status' => 'active']);
        $this->assertSame(2, DB::table('reporting_lines')->where('subordinate_id', $spv->username)->count());
    }

    public function test_chief_operation_can_manage_another_chiefs_structure_in_the_same_location(): void
    {
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $firstChief = $this->createUser('co-1', 'Chief One', 'co', 'manager');
        $secondChief = $this->createUser('co-2', 'Chief Two', 'co', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor Two', 'spv', 'supervisor');
        $this->line($sm, $firstChief);
        $this->line($sm, $secondChief);
        $line = $this->line($secondChief, $spv);

        $this->actingAs($firstChief, 'sanctum')
            ->patchJson('/api/organization-chart/relations/' . $line->id, [
                'location_id' => 'GBB',
                'status' => 'inactive',
            ])
            ->assertOk();

        $this->assertDatabaseHas('reporting_lines', ['id' => $line->id, 'status' => 'inactive']);
    }

    public function test_manager_scope_includes_direct_and_chief_operation_supervisors(): void
    {
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $co = $this->createUser('co-1', 'Chief Operation', 'co', 'manager');
        $spvUnderCo = $this->createUser('spv-1', 'Supervisor CO', 'spv', 'supervisor');
        $spvDirect = $this->createUser('spv-2', 'Supervisor Langsung', 'spv', 'supervisor');
        $this->line($sm, $co);
        $this->line($co, $spvUnderCo);
        $this->line($sm, $spvDirect);

        $scope = app(ManagerScopeService::class);
        $this->assertSame('CO', $co->manager_type);
        $this->assertEqualsCanonicalizing(
            [$spvUnderCo->username, $spvDirect->username],
            $scope->supervisorIds($sm, 'GBB')->all()
        );
        $this->assertSame([$spvUnderCo->username], $scope->supervisorIds($co, 'GBB')->all());
    }

    public function test_only_regional_manager_can_access_multiple_assigned_locations(): void
    {
        DB::table('locations')->insert(['initial' => 'YSD', 'name' => 'Yogya Sudirman', 'created_at' => now(), 'updated_at' => now()]);
        $storeManager = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $regionalManager = $this->createUser('rm-1', 'Regional Manager', 'sm', 'regional_manager');
        UserLocation::create(['user_id' => $storeManager->username, 'location_id' => 'YSD', 'job_level' => 'manager']);
        UserLocation::create(['user_id' => $regionalManager->username, 'location_id' => 'YSD', 'job_level' => 'regional_manager']);

        $scope = app(ManagerScopeService::class);
        $this->assertSame(['GBB'], $scope->accessibleLocations($storeManager->fresh())->pluck('initial')->all());
        $this->assertEqualsCanonicalizing(
            ['GBB', 'YSD'],
            $scope->accessibleLocations($regionalManager->fresh())->pluck('initial')->all()
        );
    }

    public function test_deactivating_a_line_keeps_it_but_deleting_card_removes_relations_only(): void
    {
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $crew = $this->createUser('crew-1', 'Crew', 'sc', 'sc');
        $this->line($sm, $spv);
        $line = $this->line($spv, $crew);

        $this->actingAs($sm, 'sanctum')
            ->patchJson('/api/organization-chart/relations/' . $line->id, [
                'location_id' => 'GBB',
                'status' => 'inactive',
            ])
            ->assertOk();
        $this->assertDatabaseHas('reporting_lines', ['id' => $line->id, 'status' => 'inactive']);

        $this->actingAs($sm, 'sanctum')
            ->deleteJson('/api/organization-chart/nodes/' . $crew->username, ['location_id' => 'GBB'])
            ->assertOk();
        $this->assertDatabaseMissing('reporting_lines', ['id' => $line->id]);
        $this->assertDatabaseHas('users', ['username' => $crew->username, 'active' => true]);
    }

    public function test_editing_position_updates_assignment_and_rebuilds_incoming_lines(): void
    {
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $co = $this->createUser('co-1', 'Chief Operation', 'co', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $crew = $this->createUser('crew-1', 'Crew', 'sc', 'sc');
        $this->line($sm, $co);
        $this->line($co, $spv);
        $oldLine = $this->line($spv, $crew);

        $this->actingAs($sm, 'sanctum')
            ->patchJson('/api/organization-chart/nodes/' . $crew->username, [
                'location_id' => 'GBB',
                'job_level_id' => $this->jobLevels['spv']->id,
                'leader_ids' => [$co->username],
            ])
            ->assertOk();

        $this->assertDatabaseHas('user_locations', ['user_id' => $crew->username, 'location_id' => 'GBB', 'job_level' => 'supervisor']);
        $this->assertDatabaseHas('reporting_lines', ['id' => $oldLine->id, 'status' => 'inactive']);
        $this->assertDatabaseHas('reporting_lines', ['leader_id' => $co->username, 'subordinate_id' => $crew->username, 'status' => 'active']);
    }

    public function test_parent_card_with_active_children_cannot_be_deleted(): void
    {
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $crew = $this->createUser('crew-1', 'Crew', 'sc', 'sc');
        $this->line($sm, $spv);
        $this->line($spv, $crew);

        $this->actingAs($sm, 'sanctum')
            ->deleteJson('/api/organization-chart/nodes/' . $spv->username, ['location_id' => 'GBB'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('card');
    }

    public function test_hr_job_title_uses_grade_for_organigram_tier(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $crew = $this->createUser('crew-1', 'Crew', 'sc', 'sc');
        $buyer = JobLevel::create([
            'position_code' => 'BUYER-STORE-FOOD',
            'name' => 'BUYER STORE FOOD',
            'grade' => 'STF',
            'visible_in_yodaily' => true,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/organization-chart/nodes/' . $crew->username, [
                'location_id' => 'GBB',
                'job_level_id' => $buyer->id,
                'leader_ids' => [$sm->username],
            ])
            ->assertOk();

        $this->assertDatabaseHas('user_locations', [
            'user_id' => $crew->username,
            'location_id' => 'GBB',
            'job_level' => 'supervisor',
        ]);
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/organization-chart?location_id=GBB')
            ->assertOk()
            ->assertJsonFragment([
                'username' => $crew->username,
                'job_level_name' => 'BUYER STORE FOOD',
                'tier' => 'supervisor',
            ]);
    }

    public function test_hidden_or_stale_job_level_returns_friendly_validation_error(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $crew = $this->createUser('crew-1', 'Crew', 'sc', 'sc');
        $hidden = JobLevel::create([
            'position_code' => 'OLD-STF',
            'name' => 'JABATAN LAMA',
            'grade' => 'STF',
            'visible_in_yodaily' => false,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/organization-chart/nodes/' . $crew->username, [
                'location_id' => 'GBB',
                'job_level_id' => $hidden->id,
                'leader_ids' => [$sm->username],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('job_level_id')
            ->assertJsonFragment(['Pilih jabatan yang masih aktif dan tersedia.']);
    }

    public function test_layout_is_shared_per_location_and_discards_unknown_members(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $line = $this->line($sm, $spv);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/organization-chart/layout', [
                'location_id' => 'GBB',
                'nodes' => [
                    $spv->username => ['x' => 0.25, 'y' => 0.75],
                    'unknown-user' => ['x' => 0.5, 'y' => 0.5],
                ],
                'edges' => [
                    (string) $line->id => ['points' => [['x' => 0.4, 'y' => 0.5]]],
                    '99999' => ['points' => [['x' => 0.2, 'y' => 0.2]]],
                ],
            ])
            ->assertOk()
            ->assertJsonMissing(['unknown-user'])
            ->assertJsonMissing(['99999']);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/organization-chart?location_id=GBB')
            ->assertOk();

        $this->assertSame(0.25, $response->json('layout.nodes.spv-1.x'));
        $this->assertSame(0.75, $response->json('layout.nodes.spv-1.y'));
        $this->assertSame(0.4, $response->json('layout.edges.' . $line->id . '.points.0.x'));
        $this->assertDatabaseHas('organization_chart_layouts', [
            'location_id' => 'GBB',
            'updated_by' => $admin->username,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/organization-chart/layout', [
                'location_id' => 'GBB',
                'nodes' => [],
                'edges' => [
                    (string) $line->id => ['points' => []],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('layout.edges.' . $line->id . '.points', []);
    }

    private function createUser(string $username, string $name, string $jobLevelKey, string $appRole, ?int $roleId = null): User
    {
        $user = User::create([
            'username' => $username,
            'name' => $name,
            'email' => $username . '@example.test',
            'password' => bcrypt('password'),
            'job_level_id' => $this->jobLevels[$jobLevelKey]->id,
            'role_id' => $roleId,
            'initial_store' => 'GBB',
            'active' => true,
        ]);
        UserLocation::create(['user_id' => $username, 'location_id' => 'GBB', 'job_level' => $appRole]);

        return $user->fresh(['jobLevel', 'userLocations', 'locations', 'accountRole']);
    }

    private function line(User $leader, User $subordinate): ReportingLine
    {
        return ReportingLine::withoutGlobalScope('effective_backup_period')->create([
            'leader_id' => $leader->username,
            'subordinate_id' => $subordinate->username,
            'status' => 'active',
            'relation_type' => 'permanent',
        ]);
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
            $table->string('name')->nullable();
            $table->string('description')->nullable();
            $table->string('grade')->nullable();
            $table->string('department')->nullable();
            $table->boolean('visible_in_yodaily')->default(false);
            $table->boolean('external_active')->default(true);
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
        });
        Schema::create('divisions', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->string('group_code')->nullable();
            $table->timestamps();
        });
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('initial')->unique();
            $table->string('name');
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->unique();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('password');
            $table->unsignedBigInteger('job_level_id')->nullable();
            $table->unsignedBigInteger('division_id')->nullable();
            $table->unsignedBigInteger('role_id')->nullable();
            $table->string('initial_store')->nullable();
            $table->boolean('active')->default(true);
            $table->boolean('is_back_office')->default(false);
            $table->rememberToken();
            $table->timestamps();
        });
        Schema::create('user_locations', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('location_id');
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
            $table->unique(['leader_id', 'subordinate_id']);
        });
        Schema::create('organization_chart_layouts', function (Blueprint $table) {
            $table->id();
            $table->string('location_id')->unique();
            $table->json('layout');
            $table->string('updated_by')->nullable();
            $table->timestamps();
        });
    }
}
