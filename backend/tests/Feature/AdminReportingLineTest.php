<?php

namespace Tests\Feature;

use App\Models\ReportingLine;
use App\Models\Role;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AdminReportingLineTest extends TestCase
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
        Carbon::setTestNow('2026-10-21 08:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_cms_lists_permanent_and_expired_backup_relations(): void
    {
        [$admin, $leader, $permanentCrew, $backupCrew] = $this->seedUsers();

        ReportingLine::withoutGlobalScope('effective_backup_period')->create([
            'leader_id' => $leader->username,
            'subordinate_id' => $permanentCrew->username,
            'status' => 'active',
            'relation_type' => 'permanent',
        ]);
        ReportingLine::withoutGlobalScope('effective_backup_period')->create([
            'leader_id' => $leader->username,
            'subordinate_id' => $backupCrew->username,
            'status' => 'active',
            'relation_type' => 'backup',
            'backup_request_id' => 99,
            'effective_from' => '2026-10-01',
            'effective_until' => '2026-10-10',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/cms/reporting-lines?leader_id=' . $leader->username)
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonFragment([
                'subordinate_id' => $backupCrew->username,
                'relation_type' => 'backup',
                'effective_from' => '2026-10-01',
                'effective_until' => '2026-10-10',
                'is_currently_effective' => false,
            ]);
    }

    public function test_saving_permanent_relation_converts_existing_backup_without_duplicate(): void
    {
        [$admin, $leader, $crew] = $this->seedUsers();

        $line = ReportingLine::withoutGlobalScope('effective_backup_period')->create([
            'leader_id' => $leader->username,
            'subordinate_id' => $crew->username,
            'status' => 'active',
            'relation_type' => 'backup',
            'backup_request_id' => 99,
            'effective_from' => '2026-10-01',
            'effective_until' => '2026-10-10',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/cms/reporting-lines', [
                'leader_id' => $leader->username,
                'subordinate_id' => $crew->username,
                'status' => 'active',
            ])
            ->assertCreated()
            ->assertJsonPath('id', $line->id)
            ->assertJsonPath('relation_type', 'permanent');

        $this->assertSame(1, DB::table('reporting_lines')->count());
        $this->assertDatabaseHas('reporting_lines', [
            'id' => $line->id,
            'leader_id' => $leader->username,
            'subordinate_id' => $crew->username,
            'relation_type' => 'permanent',
            'status' => 'active',
            'backup_request_id' => null,
            'effective_from' => null,
            'effective_until' => null,
        ]);
    }

    public function test_saving_existing_permanent_relation_updates_it_without_duplicate(): void
    {
        [$admin, $leader, $crew] = $this->seedUsers();

        $line = ReportingLine::withoutGlobalScope('effective_backup_period')->create([
            'leader_id' => $leader->username,
            'subordinate_id' => $crew->username,
            'status' => 'inactive',
            'relation_type' => 'permanent',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/cms/reporting-lines', [
                'leader_id' => $leader->username,
                'subordinate_id' => $crew->username,
                'status' => 'active',
            ])
            ->assertCreated()
            ->assertJsonPath('id', $line->id)
            ->assertJsonPath('status', 'active');

        $this->assertSame(1, DB::table('reporting_lines')->count());
    }

    private function seedUsers(): array
    {
        $role = Role::create([
            'name' => 'cms reporting admin',
            'description' => 'Reporting line administrator',
            'permissions' => ['reporting_lines'],
        ]);

        DB::table('locations')->insert([
            'initial' => 'TEST',
            'name' => 'Test Store',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $admin = User::create([
            'username' => 'cms-admin',
            'name' => 'CMS Admin',
            'email' => 'cms@example.test',
            'password' => bcrypt('password'),
            'role_id' => $role->id,
            'active' => true,
        ]);
        $leader = $this->createOperationalUser('leader-1', 'Supervisor', 'supervisor');
        $crew = $this->createOperationalUser('crew-1', 'Crew One', 'sc');
        $secondCrew = $this->createOperationalUser('crew-2', 'Crew Two', 'sc');

        return [$admin, $leader, $crew, $secondCrew];
    }

    private function createOperationalUser(string $username, string $name, string $jobLevel): User
    {
        $user = User::create([
            'username' => $username,
            'name' => $name,
            'email' => "{$username}@example.test",
            'password' => bcrypt('password'),
            'active' => true,
        ]);

        DB::table('user_locations')->insert([
            'user_id' => $username,
            'location_id' => 'TEST',
            'job_level' => $jobLevel,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $user;
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
            $table->string('name')->nullable();
            $table->string('position_code')->nullable();
            $table->string('grade')->nullable();
            $table->string('department')->nullable();
            $table->timestamps();
        });
        Schema::create('divisions', function (Blueprint $table) {
            $table->id();
            $table->string('code')->nullable();
            $table->string('name')->nullable();
            $table->string('group_code')->nullable();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->timestamps();
        });
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('initial')->unique();
            $table->string('name')->nullable();
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
    }
}
