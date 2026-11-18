<?php

namespace Tests\Feature;

use App\Models\Regional;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AdminRegionalTest extends TestCase
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
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->createSchema();

        DB::table('locations')->insert([
            ['initial' => 'GBB', 'name' => 'GRIYA BUAH BATU', 'region_code' => 10],
            ['initial' => 'YPC', 'name' => 'YOGYA PELAJAR PEJUANG', 'region_code' => 20],
        ]);
        $role = Role::create(['name' => 'Regional Admin', 'permissions' => ['regionals']]);
        $admin = User::create(['username' => 'regional-admin', 'name' => 'Regional Admin', 'role_id' => $role->id]);
        $this->actingAs($admin, 'sanctum');
    }

    protected function tearDown(): void
    {
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_regional_only_admin_receives_master_locations_but_cannot_edit_them(): void
    {
        $this->getJson('/api/cms/overview')
            ->assertOk()
            ->assertJsonCount(2, 'locations')
            ->assertJsonPath('locations.0.initial', 'GBB')
            ->assertJsonPath('locations.1.initial', 'YPC');

        $this->patchJson('/api/cms/locations/GBB', ['name' => 'Changed'])
            ->assertForbidden();
        $this->assertDatabaseHas('locations', ['initial' => 'GBB', 'name' => 'GRIYA BUAH BATU']);
    }

    public function test_create_accepts_master_branches_without_changing_location_region_codes(): void
    {
        $this->postJson('/api/cms/regionals', $this->payload('GBB, YPC'))
            ->assertCreated()
            ->assertJsonPath('cabang', 'GBB, YPC');

        $this->assertDatabaseHas('regional', ['kode_regional' => '001', 'cabang' => 'GBB, YPC']);
        $this->assertDatabaseHas('locations', ['initial' => 'GBB', 'region_code' => 10]);
        $this->assertDatabaseHas('locations', ['initial' => 'YPC', 'region_code' => 20]);
    }

    public function test_create_rejects_a_branch_missing_from_master_locations(): void
    {
        $this->postJson('/api/cms/regionals', $this->payload('GBB, UNKNOWN'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cabang');
        $this->assertDatabaseCount('regional', 0);
    }

    public function test_create_rejects_duplicate_branches(): void
    {
        $this->postJson('/api/cms/regionals', $this->payload('GBB, GBB'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cabang');
        $this->assertDatabaseCount('regional', 0);
    }

    public function test_create_rejects_a_list_exceeding_storage_limit_with_a_clear_message(): void
    {
        $this->postJson('/api/cms/regionals', $this->payload(str_repeat('A', 256)))
            ->assertUnprocessable()
            ->assertJsonPath('errors.cabang.0', 'Daftar cabang terlalu panjang. Kurangi pilihan cabang sebelum menyimpan.');
        $this->assertDatabaseCount('regional', 0);
    }

    public function test_editing_other_fields_preserves_legacy_text_exactly_when_branches_are_omitted(): void
    {
        $regional = Regional::create($this->payload('  GBB,  YPC, catatan lama  '));

        $this->patchJson('/api/cms/regionals/' . $regional->id, [
            'kode_regional' => '001',
            'nama_regional' => 'Nama Baru',
        ])->assertOk();

        $this->assertSame('  GBB,  YPC, catatan lama  ', $regional->fresh()->cabang);
        $this->assertSame('Nama Baru', $regional->fresh()->nama_regional);
    }

    public function test_unchanged_legacy_text_is_still_accepted(): void
    {
        $regional = Regional::create($this->payload('GBB, catatan lama'));

        $this->patchJson('/api/cms/regionals/' . $regional->id, $this->payload('GBB, catatan lama'))
            ->assertOk()
            ->assertJsonPath('cabang', 'GBB, catatan lama');
    }

    public function test_adding_a_master_branch_can_retain_existing_legacy_values(): void
    {
        $regional = Regional::create($this->payload('GBB, catatan lama'));

        $this->patchJson('/api/cms/regionals/' . $regional->id, $this->payload('GBB, catatan lama, YPC'))
            ->assertOk()
            ->assertJsonPath('cabang', 'GBB, catatan lama, YPC');
    }

    public function test_edit_cannot_introduce_an_unknown_branch_and_leaves_existing_record_unchanged(): void
    {
        $regional = Regional::create($this->payload('GBB, catatan lama'));

        $this->patchJson('/api/cms/regionals/' . $regional->id, $this->payload('GBB, catatan baru'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cabang');
        $this->assertSame('GBB, catatan lama', $regional->fresh()->cabang);
    }

    public function test_legacy_values_can_be_replaced_or_cleared_explicitly(): void
    {
        $regional = Regional::create($this->payload('GBB, catatan lama'));

        $this->patchJson('/api/cms/regionals/' . $regional->id, $this->payload('GBB, YPC'))
            ->assertOk()
            ->assertJsonPath('cabang', 'GBB, YPC');
        $this->patchJson('/api/cms/regionals/' . $regional->id, $this->payload(''))
            ->assertOk();
        $this->assertNull($regional->fresh()->cabang);
    }

    public function test_regional_write_still_requires_regional_permission(): void
    {
        $role = Role::create(['name' => 'Evaluation Admin', 'permissions' => ['evaluation_masters']]);
        $user = User::create(['username' => 'other-admin', 'name' => 'Other Admin', 'role_id' => $role->id]);
        $regional = Regional::create($this->payload('GBB'));
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/cms/regionals', $this->payload('YPC'))->assertForbidden();
        $this->patchJson('/api/cms/regionals/' . $regional->id, $this->payload('YPC'))->assertForbidden();
        $this->assertSame('GBB', $regional->fresh()->cabang);
        $this->assertDatabaseCount('regional', 1);
    }

    private function payload(string $branches): array
    {
        return ['kode_regional' => '001', 'nama_regional' => 'BANDUNG REGULER', 'cabang' => $branches];
    }

    private function createSchema(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->json('permissions')->nullable();
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->unique();
            $table->string('name');
            $table->unsignedBigInteger('role_id')->nullable();
            $table->timestamps();
        });
        Schema::create('regional', function (Blueprint $table) {
            $table->id();
            $table->string('kode_regional')->unique();
            $table->string('nama_regional');
            $table->string('cabang')->nullable();
            $table->timestamps();
        });
        Schema::create('locations', function (Blueprint $table) {
            $table->string('initial')->primary();
            $table->string('name');
            $table->integer('store_code')->nullable();
            $table->string('address')->nullable();
            $table->string('city')->nullable();
            $table->string('phone')->nullable();
            $table->integer('region_code')->nullable();
            $table->boolean('is_active')->default(true);
            $table->string('type_store')->nullable();
        });
    }
}
