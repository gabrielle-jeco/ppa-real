<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Models\WorkStation;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class TaskCatalogTest extends TestCase
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

        Schema::create('work_stations', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->json('guide_content')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->unsignedBigInteger('task_definition_id')->nullable();
        });
        Schema::create('task_assignment_batches', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_definition_id')->nullable();
        });
        foreach (['activity_logs', 'guide_reads'] as $tableName) {
            Schema::create($tableName, function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('work_station_id')->nullable();
            });
        }

        $migration = require database_path('migrations/2026_10_09_000005_create_task_catalog_tables.php');
        $migration->up();
    }

    protected function tearDown(): void
    {
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_admin_can_manage_nested_task_catalog(): void
    {
        $station = WorkStation::create(['name' => 'cashier', 'guide_content' => [], 'active' => true]);

        $areaResponse = $this->actingAs($this->cmsUser(['work_stations']), 'sanctum')
            ->postJson("/api/cms/work-stations/{$station->id}/task-areas", [
                'name' => 'Area Kasir',
                'sort_order' => 10,
                'active' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('name', 'Area Kasir');

        $areaId = $areaResponse->json('id');
        $definitionResponse = $this->actingAs($this->cmsUser(['work_stations']), 'sanctum')
            ->postJson("/api/cms/task-areas/{$areaId}/task-definitions", [
                'title' => 'Bersihkan meja kasir',
                'sort_order' => 20,
                'active' => true,
            ])
            ->assertCreated();

        $this->actingAs($this->cmsUser(['work_stations']), 'sanctum')
            ->getJson('/api/cms/task-catalog')
            ->assertOk()
            ->assertJsonPath('0.task_areas.0.task_definitions.0.title', 'Bersihkan meja kasir');

        $this->actingAs($this->cmsUser(['work_stations']), 'sanctum')
            ->deleteJson("/api/cms/task-areas/{$areaId}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('task_area');

        $this->actingAs($this->cmsUser(['work_stations']), 'sanctum')
            ->deleteJson('/api/cms/task-definitions/' . $definitionResponse->json('id'))
            ->assertOk();

        $this->actingAs($this->cmsUser(['work_stations']), 'sanctum')
            ->deleteJson("/api/cms/task-areas/{$areaId}")
            ->assertOk();
    }

    public function test_duplicate_names_are_rejected_within_the_same_parent(): void
    {
        $station = WorkStation::create(['name' => 'fashion', 'guide_content' => [], 'active' => true]);
        $payload = ['name' => 'Display', 'sort_order' => 0, 'active' => true];
        $user = $this->cmsUser(['work_stations']);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/cms/work-stations/{$station->id}/task-areas", $payload)
            ->assertCreated();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/cms/work-stations/{$station->id}/task-areas", $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }

    public function test_sqa_catalog_migration_seeds_only_sc_and_cashier_without_duplicates(): void
    {
        $migration = require database_path('migrations/2026_10_09_000006_seed_sqa_task_catalog.php');
        $migration->up();
        $migration->up();

        $this->assertSame(['cashier', 'sc'], DB::table('work_stations')->orderBy('name')->pluck('name')->all());
        $this->assertSame(9, DB::table('task_areas')->count());
        $this->assertSame(125, DB::table('task_definitions')->count());

        $scId = DB::table('work_stations')->where('name', 'sc')->value('id');
        $cashierId = DB::table('work_stations')->where('name', 'cashier')->value('id');
        $this->assertSame(8, DB::table('task_areas')->where('work_station_id', $scId)->count());
        $this->assertSame(1, DB::table('task_areas')->where('work_station_id', $cashierId)->count());

        $freshId = DB::table('task_areas')->where('work_station_id', $scId)->where('name', 'FRESH')->value('id');
        $foodStationId = DB::table('task_areas')->where('work_station_id', $scId)->where('name', 'FOOD STATION')->value('id');
        $this->assertSame(1, DB::table('task_definitions')->where('task_area_id', $freshId)->where('title', 'Suhu chiller sesuai standar')->count());
        $this->assertSame(1, DB::table('task_definitions')->where('task_area_id', $foodStationId)->where('title', 'Penanganan kompor & tabung gas aman')->count());
    }

    public function test_cms_role_without_work_station_permission_is_forbidden(): void
    {
        $station = WorkStation::create(['name' => 'fresh', 'guide_content' => [], 'active' => true]);

        $this->actingAs($this->cmsUser(['user_activity']), 'sanctum')
            ->postJson("/api/cms/work-stations/{$station->id}/task-areas", [
                'name' => 'Produce',
                'sort_order' => 0,
                'active' => true,
            ])
            ->assertForbidden();
    }

    public function test_work_station_with_task_areas_cannot_be_deleted(): void
    {
        $station = WorkStation::create(['name' => 'supermarket', 'guide_content' => [], 'active' => true]);
        $station->taskAreas()->create(['name' => 'Gondola', 'sort_order' => 0, 'active' => true]);

        $this->actingAs($this->cmsUser(['work_stations']), 'sanctum')
            ->deleteJson("/api/cms/work-stations/{$station->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('work_station');
    }

    public function test_catalog_migration_can_be_rolled_back(): void
    {
        $migration = require database_path('migrations/2026_10_09_000005_create_task_catalog_tables.php');
        $migration->down();

        $this->assertFalse(Schema::hasTable('task_definitions'));
        $this->assertFalse(Schema::hasTable('task_areas'));
        $this->assertTrue(Schema::hasTable('work_stations'));
    }

    private function cmsUser(array $permissions): User
    {
        $user = new User(['username' => 'cms-' . implode('-', $permissions)]);
        $user->setRelation('accountRole', new Role([
            'name' => 'custom cms',
            'permissions' => $permissions,
        ]));

        return $user;
    }
}
