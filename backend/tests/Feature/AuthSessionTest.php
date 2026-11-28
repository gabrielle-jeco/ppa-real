<?php

namespace Tests\Feature;

use App\Models\JobLevel;
use App\Models\Role;
use App\Models\User;
use App\Models\UserLocation;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AuthSessionTest extends TestCase
{
    private Role $userRole;
    private array $jobLevels = [];

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'cache.default' => 'array',
            'services.yoabsen.enabled' => false,
            'services.yoabsen.user_monitoring_password' => null,
        ]);
        DB::purge('sqlite');
        DB::reconnect('sqlite');
        app('cache')->setDefaultDriver('array');

        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
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
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('username')->unique();
            $table->string('email')->nullable()->unique();
            $table->string('password');
            $table->unsignedBigInteger('job_level_id')->nullable();
            $table->unsignedBigInteger('role_id')->nullable();
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
            $table->timestamps();
        });
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });
        Schema::create('user_login_events', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('role_type', 100)->nullable();
            $table->string('account_role', 100)->nullable();
            $table->string('login_source', 100)->nullable();
            $table->string('device_type', 50)->nullable();
            $table->timestamp('login_at')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();
        });

        $this->userRole = Role::create(['name' => 'user', 'permissions' => []]);
        DB::table('locations')->insert([
            ['initial' => 'GBB', 'name' => 'Griya Buah Batu', 'created_at' => now(), 'updated_at' => now()],
            ['initial' => 'YSD', 'name' => 'Yogya Sudirman', 'created_at' => now(), 'updated_at' => now()],
        ]);
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

    public function test_logout_revokes_sanctum_token_and_subsequent_authenticated_requests_fail(): void
    {
        $this->createUser('spv-1', 'spv', ['GBB' => 'supervisor'], 'GBB');

        $loginResponse = $this->postJson('/api/login', [
            'username' => 'spv-1',
            'password' => 'secret123',
        ])->assertOk();

        $token = $loginResponse->json('access_token');
        $this->assertNotEmpty($token);
        $this->assertSame(1, DB::table('personal_access_tokens')->count());

        // API routes are stateless (no StartSession middleware), so clear in-process test session/guard state.
        session()->flush();
        Auth::forgetGuards();

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('username', 'spv-1');

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/logout')
            ->assertOk();

        $this->assertSame(0, DB::table('personal_access_tokens')->count());

        session()->flush();
        Auth::forgetGuards();

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/user')
            ->assertUnauthorized();
    }

    public function test_logout_handles_transient_sanctum_token_without_error(): void
    {
        $user = $this->createUser('spv-transient', 'spv', ['GBB' => 'supervisor'], 'GBB');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/logout')
            ->assertOk();
    }

    public function test_store_manager_and_chief_operation_enforce_primary_location_scope_on_login(): void
    {
        $this->createUser('sm-noloc', 'sm', [], null);
        $this->createUser('co-noloc', 'co', [], null);
        $this->createUser('sm-gbb', 'sm', ['GBB' => 'manager'], 'GBB');
        $this->createUser('co-gbb', 'co', ['GBB' => 'manager'], 'GBB');

        foreach (['sm-noloc', 'co-noloc'] as $username) {
            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
            ])->assertForbidden();
        }

        foreach (['sm-gbb', 'co-gbb'] as $username) {
            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'YSD',
            ])
                ->assertStatus(422)
                ->assertJsonValidationErrors('location_id');

            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'GBB',
            ])
                ->assertOk()
                ->assertJsonStructure(['access_token', 'user']);

            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
            ])
                ->assertOk()
                ->assertJsonStructure(['access_token', 'user']);
        }
    }

    public function test_store_manager_and_chief_operation_with_initial_store_only_and_no_user_locations_row(): void
    {
        $this->createUser('sm-init-only', 'sm', [], 'GBB');
        $this->createUser('co-init-only', 'co', [], 'GBB');

        foreach (['sm-init-only', 'co-init-only'] as $username) {
            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
            ])
                ->assertOk()
                ->assertJsonStructure(['access_token', 'user']);

            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'GBB',
            ])
                ->assertOk()
                ->assertJsonStructure(['access_token', 'user']);

            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'YSD',
            ])
                ->assertStatus(422)
                ->assertJsonValidationErrors('location_id');
        }
    }

    public function test_store_manager_and_chief_operation_with_multiple_assigned_locations_respect_initial_store_and_deterministic_order(): void
    {
        $this->createUser('sm-multi-init', 'sm', ['GBB' => 'manager', 'YSD' => 'manager'], 'YSD');
        $this->createUser('co-multi-init', 'co', ['GBB' => 'manager', 'YSD' => 'manager'], 'YSD');

        foreach (['sm-multi-init', 'co-multi-init'] as $username) {
            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
            ])
                ->assertOk()
                ->assertJsonStructure(['access_token', 'user']);

            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'YSD',
            ])
                ->assertOk()
                ->assertJsonStructure(['access_token', 'user']);

            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'GBB',
            ])
                ->assertStatus(422)
                ->assertJsonValidationErrors('location_id');
        }

        // Insert YSD before GBB so deterministic name ordering ('Griya Buah Batu' < 'Yogya Sudirman') differs from insertion order.
        $this->createUser('sm-multi-null', 'sm', ['YSD' => 'manager', 'GBB' => 'manager'], null);
        $this->createUser('co-multi-null', 'co', ['YSD' => 'manager', 'GBB' => 'manager'], null);

        foreach (['sm-multi-null', 'co-multi-null'] as $username) {
            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'GBB',
            ])
                ->assertOk()
                ->assertJsonStructure(['access_token', 'user']);

            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'YSD',
            ])
                ->assertStatus(422)
                ->assertJsonValidationErrors('location_id');
        }
    }

    public function test_store_manager_and_chief_operation_prefer_updated_initial_store_over_stale_user_locations_pivot(): void
    {
        $this->createUser('sm-stale-pivot', 'sm', ['YSD' => 'manager'], 'GBB');
        $this->createUser('co-stale-pivot', 'co', ['YSD' => 'manager'], 'GBB');

        foreach (['sm-stale-pivot', 'co-stale-pivot'] as $username) {
            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
            ])
                ->assertOk()
                ->assertJsonStructure(['access_token', 'user']);

            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'GBB',
            ])
                ->assertOk()
                ->assertJsonStructure(['access_token', 'user']);

            $this->postJson('/api/login', [
                'username' => $username,
                'password' => 'secret123',
                'location_id' => 'YSD',
            ])
                ->assertStatus(422)
                ->assertJsonValidationErrors('location_id');
        }
    }

    public function test_regional_manager_and_non_manager_roles_preserve_login_behavior(): void
    {
        $this->createUser('rm-1', 'sm', ['GBB' => 'regional_manager', 'YSD' => 'regional_manager'], 'GBB');
        $this->createUser('spv-2', 'spv', ['GBB' => 'supervisor'], 'GBB');
        $this->createUser('crew-1', 'sc', ['GBB' => 'sc'], 'GBB');

        $this->postJson('/api/login', [
            'username' => 'rm-1',
            'password' => 'secret123',
            'location_id' => 'YSD',
        ])
            ->assertOk()
            ->assertJsonPath('user.manager_type', 'RM');

        $this->postJson('/api/login', [
            'username' => 'rm-1',
            'password' => 'secret123',
        ])
            ->assertOk()
            ->assertJsonPath('user.manager_type', 'RM');

        $this->postJson('/api/login', [
            'username' => 'spv-2',
            'password' => 'secret123',
        ])
            ->assertOk()
            ->assertJsonPath('user.role_type', 'supervisor');

        $this->postJson('/api/login', [
            'username' => 'crew-1',
            'password' => 'secret123',
        ])
            ->assertOk()
            ->assertJsonPath('user.role_type', 'employee');
    }

    private function createUser(string $username, string $jobKey, array $locations, ?string $initialStore): User
    {
        $user = User::create([
            'name' => $username,
            'username' => $username,
            'password' => Hash::make('secret123'),
            'job_level_id' => $this->jobLevels[$jobKey]->id,
            'role_id' => $this->userRole->id,
            'initial_store' => $initialStore,
            'active' => true,
        ]);

        foreach ($locations as $locationId => $appLevel) {
            UserLocation::create([
                'user_id' => $username,
                'location_id' => $locationId,
                'job_level' => $appLevel,
            ]);
        }

        return $user;
    }
}
