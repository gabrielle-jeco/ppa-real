<?php

namespace Tests\Feature;

use App\Models\JobLevel;
use App\Models\OrganizationChartLayout;
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

    public function test_group_deactivation_is_atomic_scoped_and_does_not_delete_members(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $a = $this->createUser('spv-a', 'A', 'spv', 'supervisor');
        $b = $this->createUser('spv-b', 'B', 'spv', 'supervisor');
        for ($i = 0; $i < 9; $i++) $this->line($a, $this->createUser('crew-' . $i, 'Crew ' . $i, 'sc', 'sc'));
        $this->line($b, User::where('username', 'crew-0')->first());
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/groups/spv-a/status', ['location_id' => 'GBB', 'status' => 'inactive'])->assertOk();
        $this->assertSame(9, ReportingLine::where('leader_id', 'spv-a')->where('status', 'inactive')->count());
        $this->assertDatabaseHas('reporting_lines', ['leader_id' => 'spv-b', 'subordinate_id' => 'crew-0', 'status' => 'active']);
        $this->actingAs($admin, 'sanctum')->getJson('/api/organization-chart?location_id=GBB&supervisor_id=spv-a')->assertOk()->assertJsonCount(10, 'nodes');
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/groups/spv-a/status', ['location_id' => 'YPC', 'status' => 'active'])->assertForbidden();
        $this->assertSame(9, ReportingLine::where('leader_id', 'spv-a')->where('status', 'inactive')->count());
    }

    public function test_backup_tracks_source_deactivate_rejoin_reassign_and_delete_without_deleting_request(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $a = $this->createUser('spv-a', 'A', 'spv', 'supervisor');
        $b = $this->createUser('spv-b', 'Backup', 'spv', 'supervisor');
        $c = $this->createUser('spv-c', 'C', 'spv', 'supervisor');
        $crew = $this->createUser('crew', 'Crew', 'sc', 'sc');
        $source = $this->line($a, $crew);
        $request = \App\Models\SupervisorBackupRequest::create(['requester_id' => $a->username, 'backup_supervisor_id' => $b->username, 'start_date' => now()->subDay(), 'end_date' => now()->addDay(), 'status' => 'approved']);
        app(\App\Services\BackupMirrorService::class)->syncForRequest($request);
        $backup = ReportingLine::where('leader_id', 'spv-b')->firstOrFail();
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/relations/' . $backup->id, ['location_id' => 'GBB', 'status' => 'inactive'])->assertOk();
        $this->assertDatabaseHas('reporting_lines', ['id' => $source->id, 'status' => 'inactive']);
        $this->assertFalse(ReportingLine::whereKey($backup->id)->exists());
        $this->actingAs($admin, 'sanctum')->getJson('/api/organization-chart?location_id=GBB&supervisor_id=spv-b')->assertOk()->assertJsonCount(2, 'nodes')->assertJsonFragment(['status' => 'inactive']);
        $this->line($c, $crew);
        $this->assertFalse(ReportingLine::whereKey($backup->id)->exists());
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/relations/' . $backup->id, ['location_id' => 'GBB', 'status' => 'active'])->assertOk();
        $this->assertTrue(ReportingLine::whereKey($backup->id)->where('status', 'active')->exists());
        $new = $this->createUser('crew-new', 'New', 'sc', 'sc');
        $this->line($a, $new);
        $this->assertTrue(ReportingLine::where('leader_id', 'spv-b')->where('subordinate_id', 'crew-new')->exists());
        $this->actingAs($admin, 'sanctum')->deleteJson('/api/organization-chart/nodes/crew', ['location_id' => 'GBB'])->assertOk();
        $this->assertDatabaseHas('users', ['username' => 'crew']);
        $this->assertDatabaseMissing('reporting_lines', ['subordinate_id' => 'crew', 'relation_type' => 'permanent']);
        $this->assertFalse(ReportingLine::whereKey($backup->id)->exists());
        $this->assertDatabaseHas('supervisor_backup_requests', ['id' => $request->id, 'status' => 'approved']);
    }

    public function test_new_card_can_start_inactive_and_virtual_group_layout_survives_reload(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $spv = $this->createUser('spv', 'Supervisor', 'spv', 'supervisor');
        $crew = $this->createUser('crew', 'Crew', 'sc', 'sc');
        $this->actingAs($admin, 'sanctum')->postJson('/api/organization-chart/nodes', ['location_id' => 'GBB', 'username' => 'crew', 'job_level_id' => $this->jobLevels['sc']->id, 'leader_ids' => ['spv'], 'initial_status' => 'inactive'])->assertOk();
        $line = ReportingLine::where('leader_id', 'spv')->firstOrFail();
        $this->assertSame('inactive', $line->status);
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/layout', [
            'location_id' => 'GBB', 'supervisor_id' => 'spv', 'nodes' => ['__group__:spv' => ['x' => .4, 'y' => .6]],
            'edges' => [(string)-$line->id => ['points' => [['x' => .5, 'y' => .4]]]],
        ])->assertOk()->assertJsonPath('layout.nodes.__group__:spv.x', .4);
        $this->actingAs($admin, 'sanctum')->getJson('/api/organization-chart?location_id=GBB&supervisor_id=spv')->assertOk()->assertJsonPath('layout.nodes.__group__:spv.y', .6);
    }

    public function test_group_conflict_rolls_back_every_member_and_mirror(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $a = $this->createUser('spv-a', 'A', 'spv', 'supervisor');
        $b = $this->createUser('spv-b', 'Backup', 'spv', 'supervisor');
        foreach (['crew-1', 'crew-2'] as $id) $this->line($a, $this->createUser($id, $id, 'sc', 'sc'))->update(['status' => 'inactive']);
        $this->line($b, User::where('username', 'crew-2')->first())->update(['status' => 'inactive']);
        \App\Models\SupervisorBackupRequest::create(['requester_id' => 'spv-a', 'backup_supervisor_id' => 'spv-b', 'start_date' => now()->subDay(), 'end_date' => now()->addDay(), 'status' => 'approved']);
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/groups/spv-a/status', ['location_id' => 'GBB', 'status' => 'active'])->assertUnprocessable();
        $this->assertSame(2, ReportingLine::where('leader_id', 'spv-a')->where('status', 'inactive')->count());
        $this->assertDatabaseMissing('reporting_lines', ['leader_id' => 'spv-b', 'subordinate_id' => 'crew-1']);
        $this->assertDatabaseCount('supervisor_backup_assignments', 0);
    }

    public function test_scheduled_backup_sync_keeps_current_period_then_activates_the_next_period(): void
    {
        $a = $this->createUser('spv-a', 'A', 'spv', 'supervisor');
        $b = $this->createUser('spv-b', 'B', 'spv', 'supervisor');
        $crew = $this->createUser('crew', 'Crew', 'sc', 'sc');
        $this->line($a, $crew);
        $today = now()->startOfDay();
        $current = \App\Models\SupervisorBackupRequest::create(['requester_id' => 'spv-a', 'backup_supervisor_id' => 'spv-b', 'start_date' => $today->copy()->subDay(), 'end_date' => $today, 'status' => 'approved']);
        $next = \App\Models\SupervisorBackupRequest::create(['requester_id' => 'spv-a', 'backup_supervisor_id' => 'spv-b', 'start_date' => $today->copy()->addDay(), 'end_date' => $today->copy()->addDays(3), 'status' => 'approved']);
        $this->artisan('backup:sync')->assertExitCode(0);
        $this->assertSame($current->id, ReportingLine::where('leader_id', 'spv-b')->firstOrFail()->backup_request_id);
        \Carbon\Carbon::setTestNow($today->copy()->addDay()->addHours(10));
        try {
            $this->artisan('backup:sync')->assertExitCode(0);
            $this->assertSame($next->id, ReportingLine::where('leader_id', 'spv-b')->firstOrFail()->backup_request_id);
            $this->assertDatabaseCount('supervisor_backup_assignments', 2);
        } finally { \Carbon\Carbon::setTestNow(); }
    }

    public function test_spatial_drop_saves_relationship_and_free_card_position_atomically(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $a = $this->createUser('spv-a', 'A', 'spv', 'supervisor');
        $b = $this->createUser('spv-b', 'B', 'spv', 'supervisor');
        $crew = $this->createUser('crew', 'Crew', 'sc', 'sc');
        $line = $this->line($a, $crew); $other = $this->line($b, $crew);
        $payload = ['location_id' => 'GBB', 'supervisor_id' => 'spv-a', 'nodes' => ['crew' => ['x' => .8, 'y' => .7], '__space__:spv-a' => ['x' => .1, 'y' => .3]], 'edges' => [], 'canvas' => ['width' => 1800, 'height' => 1400], 'transitions' => [['leader_id' => 'spv-a', 'status' => 'inactive']]];
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/nodes/crew/placement', $payload)->assertOk()->assertJsonPath('layout.nodes.crew.x', .8);
        $this->assertDatabaseHas('reporting_lines', ['id' => $line->id, 'status' => 'inactive']);
        $this->assertDatabaseHas('reporting_lines', ['id' => $other->id, 'status' => 'active']);
        $payload['transitions'][0]['status'] = 'active'; $payload['nodes']['crew']['x'] = .35;
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/nodes/crew/placement', $payload)->assertOk();
        $this->assertDatabaseHas('reporting_lines', ['id' => $line->id, 'status' => 'active']);
        $payload['transitions'][0]['status'] = 'inactive'; $payload['nodes']['crew']['x'] = 1.1;
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/nodes/crew/placement', $payload)->assertUnprocessable();
        $this->assertDatabaseHas('reporting_lines', ['id' => $line->id, 'status' => 'active']);
        $this->actingAs($admin, 'sanctum')->getJson('/api/organization-chart?location_id=GBB&supervisor_id=spv-a')->assertOk()->assertJsonPath('layout.nodes.crew.x', .35);
        $this->assertDatabaseCount('reporting_lines', 2);
    }

    public function test_spatial_drop_can_add_a_second_supervisor_and_rejects_non_crew_and_cross_branch(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $a = $this->createUser('spv-a', 'A', 'spv', 'supervisor');
        $b = $this->createUser('spv-b', 'B', 'spv', 'supervisor');
        $crew = $this->createUser('crew', 'Crew', 'sc', 'sc'); $this->line($a, $crew);
        $payload = ['location_id' => 'GBB', 'nodes' => ['crew' => ['x' => .3, 'y' => .4]], 'edges' => [], 'transitions' => [['leader_id' => 'spv-b', 'status' => 'active']]];
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/nodes/crew/placement', $payload)->assertOk();
        $this->assertDatabaseHas('reporting_lines', ['leader_id' => 'spv-a', 'subordinate_id' => 'crew', 'status' => 'active']);
        $this->assertDatabaseHas('reporting_lines', ['leader_id' => 'spv-b', 'subordinate_id' => 'crew', 'status' => 'active']);
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/nodes/spv-a/placement', $payload)->assertUnprocessable();
        $payload['location_id'] = 'YPC';
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/nodes/crew/placement', $payload)->assertForbidden();
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

    public function test_supervisor_selection_starts_empty_and_loading_does_not_write_layout(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $this->line($sm, $spv);
        $layout = OrganizationChartLayout::create([
            'location_id' => 'GBB',
            'layout' => ['nodes' => ['spv-1' => ['x' => 0.2, 'y' => 0.7]], 'edges' => []],
            'updated_by' => $admin->username,
        ]);
        $original = $layout->getRawOriginal('layout');

        foreach ([$admin, $sm] as $actor) {
            $this->actingAs($actor, 'sanctum')->getJson('/api/organization-chart?location_id=GBB&view=supervisor')
                ->assertOk()->assertJsonCount(0, 'nodes')->assertJsonCount(0, 'edges')
                ->assertJsonCount(1, 'supervisors')->assertJsonPath('supervisors.0.username', 'spv-1');
        }
        $this->actingAs($admin, 'sanctum')->getJson('/api/organization-chart?location_id=GBB&view=supervisor&supervisor_id=spv-1')
            ->assertOk()->assertJsonPath('layout.nodes', []);
        $this->assertSame($original, $layout->fresh()->getRawOriginal('layout'));
        $this->assertDatabaseCount('organization_chart_layouts', 1);
    }

    public function test_focus_shows_all_supervisor_ancestors_and_shared_crew_without_other_teams(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $otherSm = $this->createUser('sm-2', 'Other Manager', 'sm', 'manager');
        $co = $this->createUser('co-1', 'Chief One', 'co', 'manager');
        $otherCo = $this->createUser('co-2', 'Chief Two', 'co', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor One', 'spv', 'supervisor');
        $otherSpv = $this->createUser('spv-2', 'Supervisor Two', 'spv', 'supervisor');
        $sharedCrew = $this->createUser('crew-1', 'Shared Crew', 'sc', 'sc');
        $otherCrew = $this->createUser('crew-2', 'Other Crew', 'sc', 'sc');
        $selectedEdges = [
            $this->line($sm, $co)->id,
            $this->line($co, $spv)->id,
            $this->line($otherSm, $spv)->id,
            $this->line($spv, $sharedCrew)->id,
        ];
        $this->line($sm, $otherCo);
        $this->line($otherCo, $otherSpv);
        $this->line($otherSpv, $sharedCrew);
        $this->line($otherSpv, $otherCrew);

        foreach ([$admin, $sm, $co] as $actor) {
            $response = $this->actingAs($actor, 'sanctum')
                ->getJson('/api/organization-chart?location_id=GBB&view=supervisor&supervisor_id=spv-1')->assertOk();
            $this->assertEqualsCanonicalizing(['sm-1', 'sm-2', 'co-1', 'spv-1', 'crew-1'], array_column($response->json('nodes'), 'username'));
            $this->assertEqualsCanonicalizing($selectedEdges, array_column($response->json('edges'), 'id'));
            $crew = collect($response->json('nodes'))->firstWhere('username', 'crew-1');
            $this->assertEqualsCanonicalizing(['spv-1', 'spv-2'], $crew['leader_ids']);
            $this->assertContains('spv-2', array_column($response->json('parent_nodes'), 'username'));
        }
        $this->actingAs($admin, 'sanctum')->getJson('/api/organization-chart?location_id=GBB&view=all')
            ->assertOk()->assertJsonCount(8, 'nodes')->assertJsonCount(8, 'edges');
        $this->assertDatabaseCount('reporting_lines', 8);
    }

    public function test_unassigned_supervisor_can_be_selected_without_promoting_hidden_members_to_candidates(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor One', 'spv', 'supervisor');
        $standalone = $this->createUser('spv-2', 'Supervisor Two', 'spv', 'supervisor');
        $crew = $this->createUser('crew-1', 'Crew', 'sc', 'sc');
        $this->line($sm, $spv);
        $this->line($spv, $crew);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/organization-chart?location_id=GBB&view=supervisor&supervisor_id=spv-2')
            ->assertOk()->assertJsonCount(1, 'nodes')->assertJsonCount(0, 'edges')
            ->assertJsonCount(1, 'candidates')->assertJsonPath('candidates.0.username', 'admin')->assertJsonCount(2, 'supervisors');
        $this->assertSame($standalone->username, $response->json('nodes.0.username'));
    }

    public function test_focus_preserves_inactive_relations_and_only_effective_backup_crew(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $inactiveCrew = $this->createUser('crew-1', 'Inactive Relation', 'sc', 'sc');
        $backupCrew = $this->createUser('crew-2', 'Backup Crew', 'sc', 'sc');
        $expiredCrew = $this->createUser('crew-3', 'Expired Backup', 'sc', 'sc');
        $this->line($spv, $inactiveCrew)->update(['status' => 'inactive']);
        $origin = $this->createUser('origin-spv', 'Origin', 'spv', 'supervisor');
        $this->line($origin, $backupCrew);
        $request = \App\Models\SupervisorBackupRequest::create(['requester_id' => $origin->username, 'backup_supervisor_id' => $spv->username, 'start_date' => now()->subDay(), 'end_date' => now()->addDay(), 'status' => 'approved']);
        $this->line($spv, $backupCrew)->update([
            'relation_type' => 'backup', 'backup_request_id' => $request->id, 'effective_from' => now()->subDay(), 'effective_until' => now()->addDay(),
        ]);
        $this->line($spv, $expiredCrew)->update([
            'relation_type' => 'backup', 'effective_from' => now()->subDays(3), 'effective_until' => now()->subDays(2),
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/organization-chart?location_id=GBB&supervisor_id=spv-1')->assertOk();
        $this->assertEqualsCanonicalizing(['spv-1', 'crew-1', 'crew-2'], array_column($response->json('nodes'), 'username'));
        $response->assertJsonCount(2, 'edges')->assertJsonFragment(['status' => 'inactive']);
    }

    public function test_supervisor_filter_rejects_unknown_wrong_tier_and_other_branch_members(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $crew = $this->createUser('crew-1', 'Crew', 'sc', 'sc');
        $spv = $this->createUser('spv-2', 'Other Branch', 'spv', 'supervisor');
        $spv->update(['initial_store' => 'YPC']);
        UserLocation::where('user_id', $spv->username)->update(['location_id' => 'YPC']);

        foreach (['unknown', $crew->username, $spv->username] as $id) {
            $this->actingAs($admin, 'sanctum')->getJson('/api/organization-chart?location_id=GBB&supervisor_id=' . $id)
                ->assertUnprocessable()->assertJsonValidationErrors('supervisor_id');
        }
    }

    public function test_manager_cannot_use_filter_to_access_another_branch(): void
    {
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        DB::table('locations')->insert(['initial' => 'YPC', 'name' => 'Other Branch']);
        $this->actingAs($sm, 'sanctum')->getJson('/api/organization-chart?location_id=YPC&supervisor_id=' . $spv->username)
            ->assertForbidden();
        $this->actingAs($sm, 'sanctum')->patchJson('/api/organization-chart/layout', [
            'location_id' => 'YPC', 'supervisor_id' => $spv->username, 'nodes' => [], 'edges' => [],
        ])->assertForbidden();
    }

    public function test_focused_layout_save_and_reset_preserve_full_branch_and_other_supervisor_layouts(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $first = $this->createUser('spv-1', 'Supervisor One', 'spv', 'supervisor');
        $second = $this->createUser('spv-2', 'Supervisor Two', 'spv', 'supervisor');
        $firstLine = $this->line($sm, $first);
        $hiddenLine = $this->line($sm, $second);
        $root = ['nodes' => ['spv-2' => ['x' => 0.8, 'y' => 0.4]], 'edges' => [(string) $hiddenLine->id => ['points' => [['x' => 0.2, 'y' => 0.4]]]]];
        $otherView = ['nodes' => ['spv-2' => ['x' => 0.5, 'y' => 0.5]], 'edges' => []];
        $record = OrganizationChartLayout::create([
            'location_id' => 'GBB', 'layout' => [...$root, 'views' => ['spv-2' => $otherView]], 'updated_by' => $admin->username,
        ]);

        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/layout', [
            'location_id' => 'GBB', 'supervisor_id' => 'spv-1',
            'nodes' => ['spv-1' => ['x' => 0.3, 'y' => 0.6], 'spv-2' => ['x' => 0.1, 'y' => 0.1]],
            'edges' => [
                (string) $firstLine->id => [
                    'points' => [['x' => 0.4, 'y' => 0.4]],
                    'start_anchor' => ['side' => 'bottom', 'position' => 0.3],
                    'end_anchor' => ['side' => 'top', 'position' => 0.7],
                ],
                (string) $hiddenLine->id => ['points' => []],
            ],
        ])->assertOk()->assertJsonPath('layout.nodes.spv-1.x', 0.3)->assertJsonMissingPath('layout.nodes.spv-2')
            ->assertJsonMissingPath('layout.edges.' . $hiddenLine->id);

        $stored = $record->fresh()->layout;
        $this->assertSame($root['nodes'], $stored['nodes']);
        $this->assertSame($root['edges'], $stored['edges']);
        $this->assertSame($otherView, $stored['views']['spv-2']);
        $this->getJson('/api/organization-chart?location_id=GBB&supervisor_id=spv-1')
            ->assertOk()->assertJsonPath('layout.nodes.spv-1.x', 0.3)
            ->assertJsonPath('layout.edges.' . $firstLine->id . '.start_anchor.position', 0.3)
            ->assertJsonPath('layout.edges.' . $firstLine->id . '.end_anchor.side', 'top');
        $this->getJson('/api/organization-chart?location_id=GBB&view=all')
            ->assertOk()->assertJsonPath('layout.nodes.spv-2.x', 0.8);

        $this->patchJson('/api/organization-chart/layout', [
            'location_id' => 'GBB', 'supervisor_id' => 'spv-1', 'nodes' => [], 'edges' => [],
        ])->assertOk();
        $stored = $record->fresh()->layout;
        $this->assertSame($root['nodes'], $stored['nodes']);
        $this->assertSame($root['edges'], $stored['edges']);
        $this->assertSame($otherView, $stored['views']['spv-2']);

        $this->patchJson('/api/organization-chart/layout', ['location_id' => 'GBB', 'nodes' => [], 'edges' => []])->assertOk();
        $this->assertSame($otherView, $record->fresh()->layout['views']['spv-2']);
        $this->assertDatabaseCount('reporting_lines', 2);
    }

    public function test_canvas_coordinates_round_trip_in_focused_view_without_changing_legacy_layout(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $line = $this->line($sm, $spv);
        $legacy = ['nodes' => ['spv-1' => ['x' => 0.2, 'y' => 0.7]], 'edges' => []];
        OrganizationChartLayout::create(['location_id' => 'GBB', 'layout' => $legacy, 'updated_by' => 'admin']);
        $canvas = ['width' => 1800, 'height' => 1200];
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/layout', [
            'location_id' => 'GBB', 'supervisor_id' => 'spv-1', 'canvas' => $canvas,
            'nodes' => ['spv-1' => ['x' => 0.3, 'y' => 0.9]], 'edges' => [(string) $line->id => ['points' => []]],
        ])->assertOk()->assertJsonPath('layout.canvas', $canvas)->assertJsonPath('layout.nodes.spv-1.y', 0.9);
        $this->getJson('/api/organization-chart?location_id=GBB&view=supervisor&supervisor_id=spv-1')
            ->assertOk()->assertJsonPath('layout.canvas', $canvas);
        $this->getJson('/api/organization-chart?location_id=GBB')->assertOk()
            ->assertJsonPath('layout.nodes', $legacy['nodes'])->assertJsonMissingPath('layout.canvas');
        $this->patchJson('/api/organization-chart/layout', ['location_id' => 'GBB', 'nodes' => [], 'edges' => [], 'canvas' => $canvas])
            ->assertOk()->assertJsonPath('layout.canvas', $canvas);
        $this->getJson('/api/organization-chart?location_id=GBB')->assertOk()->assertJsonPath('layout.canvas', $canvas);
        $this->assertDatabaseCount('reporting_lines', 1);
    }

    public function test_canvas_bounds_reject_invalid_or_incomplete_sizes(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $this->actingAs($admin, 'sanctum');
        foreach ([[], ['width' => 899, 'height' => 760], ['width' => 900, 'height' => 759], ['width' => 900], ['width' => 1000001, 'height' => 760]] as $canvas) {
            $this->patchJson('/api/organization-chart/layout', ['location_id' => 'GBB', 'nodes' => [], 'edges' => [], 'canvas' => $canvas])
                ->assertUnprocessable();
        }
        $this->assertDatabaseCount('organization_chart_layouts', 0);
    }

    public function test_endpoint_anchors_round_trip_without_changing_relations_or_other_layout_data(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $line = $this->line($sm, $spv);
        $route = [
            'points' => [['x' => 0.4, 'y' => 0.5], ['x' => 0.7, 'y' => 0.8]],
            'start_anchor' => ['side' => 'right', 'position' => 0.1234567],
            'end_anchor' => ['side' => 'left', 'position' => 0.75],
        ];

        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/layout', [
            'location_id' => 'GBB', 'nodes' => ['spv-1' => ['x' => 0.6, 'y' => 0.4]], 'edges' => [(string) $line->id => $route],
        ])->assertOk()->assertJsonPath('layout.edges.' . $line->id . '.start_anchor.position', 0.12346);

        $response = $this->getJson('/api/organization-chart?location_id=GBB')->assertOk();
        $this->assertSame($route['points'], $response->json('layout.edges.' . $line->id . '.points'));
        $response->assertJsonPath('layout.edges.' . $line->id . '.start_anchor.side', 'right')
            ->assertJsonPath('layout.edges.' . $line->id . '.end_anchor.position', 0.75)
            ->assertJsonPath('layout.nodes.spv-1.x', 0.6);
        $this->assertDatabaseCount('reporting_lines', 1);
        $this->assertDatabaseHas('reporting_lines', ['id' => $line->id, 'status' => 'active']);
    }

    public function test_endpoint_anchors_reject_invalid_sides_positions_and_incomplete_objects(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $line = $this->line($sm, $spv);
        $this->actingAs($admin, 'sanctum');

        foreach (['start_anchor', 'end_anchor'] as $key) {
            foreach ([
                ['side' => 'centre', 'position' => 0.5],
                ['side' => 'top', 'position' => -0.1],
                ['side' => 'top', 'position' => 1.1],
                ['side' => 'top'],
                ['position' => 0.5],
                [],
            ] as $anchor) {
                $this->patchJson('/api/organization-chart/layout', [
                    'location_id' => 'GBB', 'nodes' => [], 'edges' => [(string) $line->id => ['points' => [], $key => $anchor]],
                ])->assertUnprocessable();
            }
        }
        $this->assertDatabaseCount('organization_chart_layouts', 0);
        $this->assertDatabaseCount('reporting_lines', 1);
    }

    public function test_legacy_layout_with_only_checkpoints_remains_supported(): void
    {
        $admin = $this->createUser('admin', 'Admin', 'sc', 'sc', $this->adminRole->id);
        $sm = $this->createUser('sm-1', 'Store Manager', 'sm', 'manager');
        $spv = $this->createUser('spv-1', 'Supervisor', 'spv', 'supervisor');
        $line = $this->line($sm, $spv);
        $route = ['points' => [['x' => 0.4, 'y' => 0.5]]];
        $this->actingAs($admin, 'sanctum')->patchJson('/api/organization-chart/layout', [
            'location_id' => 'GBB', 'nodes' => [], 'edges' => [(string) $line->id => $route],
        ])->assertOk()->assertJsonMissingPath('layout.edges.' . $line->id . '.start_anchor');
        $this->getJson('/api/organization-chart?location_id=GBB')->assertOk()
            ->assertJsonPath('layout.edges.' . $line->id, $route);
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
        $this->createBackupTables();
        Schema::create('organization_chart_layouts', function (Blueprint $table) {
            $table->id();
            $table->string('location_id')->unique();
            $table->json('layout');
            $table->string('updated_by')->nullable();
            $table->timestamps();
        });
    }
}
