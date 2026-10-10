<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SupervisorCashierTest extends TestCase
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
            $table->string('initial_store')->nullable();
            $table->string('cashier_id')->nullable()->unique();
            $table->unsignedBigInteger('role_id')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('initial')->unique();
            $table->string('name');
        });
        Schema::create('user_locations', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('location_id')->nullable();
            $table->string('job_level')->nullable();
        });
        Schema::create('reporting_lines', function (Blueprint $table) {
            $table->id();
            $table->string('leader_id');
            $table->string('subordinate_id');
            $table->string('status')->default('active');
            $table->string('relation_type')->default('permanent');
        });
        Schema::create('push_selling_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('location_id');
            $table->string('plu');
            $table->string('product_name');
            $table->date('start_date');
            $table->date('end_date');
            $table->boolean('is_active')->default(true);
            $table->string('created_by');
            $table->string('updated_by')->nullable();
            $table->timestamps();
        });

        DB::table('locations')->insert([
            ['initial' => 'YGC', 'name' => 'Yogya Ciwalk'],
            ['initial' => 'BDO', 'name' => 'Yogya Bandung'],
        ]);
        DB::table('users')->insert([
            ['username' => 'spv-1', 'name' => 'Supervisor Satu', 'initial_store' => 'YGC', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'spv-2', 'name' => 'Supervisor Dua', 'initial_store' => 'YGC', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'spv-3', 'name' => 'Supervisor Tiga', 'initial_store' => 'BDO', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-1', 'name' => 'Kasir Satu', 'initial_store' => 'YGC', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-2', 'name' => 'Kasir Dua', 'initial_store' => 'YGC', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-3', 'name' => 'Kasir Lain', 'initial_store' => 'BDO', 'active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('user_locations')->insert([
            ['user_id' => 'spv-1', 'location_id' => 'YGC', 'job_level' => 'supervisor'],
            ['user_id' => 'spv-2', 'location_id' => 'YGC', 'job_level' => 'supervisor'],
            ['user_id' => 'spv-3', 'location_id' => 'BDO', 'job_level' => 'supervisor'],
            ['user_id' => 'crew-1', 'location_id' => 'YGC', 'job_level' => 'sc'],
            ['user_id' => 'crew-2', 'location_id' => 'YGC', 'job_level' => 'sc'],
            ['user_id' => 'crew-3', 'location_id' => 'BDO', 'job_level' => 'sc'],
        ]);
        DB::table('reporting_lines')->insert([
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-1', 'status' => 'active', 'relation_type' => 'permanent'],
            ['leader_id' => 'spv-1', 'subordinate_id' => 'crew-2', 'status' => 'active', 'relation_type' => 'permanent'],
        ]);
    }

    protected function tearDown(): void
    {
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_supervisor_can_map_cashier_id_only_for_permanent_team(): void
    {
        $this->actingAs($this->user('spv-1'), 'sanctum')
            ->patchJson('/api/supervisor/cashier/crew/crew-1', ['cashier_id' => 'KSR-001'])
            ->assertOk()
            ->assertJsonPath('crew.cashier_id', 'KSR-001');

        $this->assertDatabaseHas('users', ['username' => 'crew-1', 'cashier_id' => 'KSR-001']);

        $this->actingAs($this->user('spv-1'), 'sanctum')
            ->patchJson('/api/supervisor/cashier/crew/crew-3', ['cashier_id' => 'KSR-003'])
            ->assertForbidden();
    }

    public function test_cashier_id_must_be_unique(): void
    {
        DB::table('users')->where('username', 'crew-1')->update(['cashier_id' => 'KSR-001']);

        $this->actingAs($this->user('spv-1'), 'sanctum')
            ->patchJson('/api/supervisor/cashier/crew/crew-2', ['cashier_id' => 'KSR-001'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cashier_id');
    }

    public function test_campaign_is_shared_in_the_same_store_and_isolated_from_other_stores(): void
    {
        $created = $this->actingAs($this->user('spv-1'), 'sanctum')
            ->postJson('/api/supervisor/push-selling-campaigns', [
                'plu' => '03490303',
                'product_name' => 'Indomie Ayam Bawang',
                'start_date' => '2026-10-01',
                'end_date' => '2026-10-31',
                'is_active' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('campaign.location_id', 'YGC');

        $campaignId = $created->json('campaign.id');

        $this->actingAs($this->user('spv-2'), 'sanctum')
            ->getJson('/api/supervisor/push-selling-campaigns')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $campaignId);

        $this->actingAs($this->user('spv-2'), 'sanctum')
            ->getJson('/api/supervisor/push-selling-campaigns?q=INDOMIE')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->actingAs($this->user('spv-3'), 'sanctum')
            ->getJson('/api/supervisor/push-selling-campaigns')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($this->user('spv-3'), 'sanctum')
            ->getJson("/api/supervisor/push-selling-campaigns/{$campaignId}")
            ->assertNotFound();
    }

    public function test_campaign_detail_keeps_missing_beyond_data_unavailable_instead_of_zero(): void
    {
        $campaignId = DB::table('push_selling_campaigns')->insertGetId([
            'location_id' => 'YGC',
            'plu' => '03490303',
            'product_name' => 'Indomie Ayam Bawang',
            'start_date' => '2026-10-01',
            'end_date' => '2026-10-31',
            'is_active' => true,
            'created_by' => 'spv-1',
            'updated_by' => 'spv-1',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($this->user('spv-1'), 'sanctum')
            ->getJson("/api/supervisor/push-selling-campaigns/{$campaignId}")
            ->assertOk()
            ->assertJsonPath('sales.available', false)
            ->assertJsonPath('sales.total_quantity', null)
            ->assertJsonCount(0, 'sales.rows')
            ->assertJsonPath('sales.message', 'Belum ada data dari Beyond.');
    }

    private function user(string $username): User
    {
        return User::where('username', $username)->firstOrFail();
    }
}
