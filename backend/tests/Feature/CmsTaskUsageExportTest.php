<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\TaskUsageReportService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CmsTaskUsageExportTest extends TestCase
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

    public function test_export_counts_a_bulk_assignment_once_per_scheduled_date(): void
    {
        $rows = app(TaskUsageReportService::class)->rows([
            'location' => 'GBB',
            'start_date' => '2026-11-01',
            'end_date' => '2026-11-10',
            'sort_by' => 'frequency',
            'sort_direction' => 'desc',
        ]);

        $this->assertCount(2, $rows);
        $this->assertSame('Display', $rows[0]['task']);
        $this->assertSame(3, $rows[0]['usage_count']);
        $this->assertSame('2026-11-04', $rows[0]['last_used']);
        $this->assertSame(1, $rows[1]['usage_count']);
    }

    public function test_authorized_admin_can_download_the_xlsx(): void
    {
        $this->actingAs(User::where('username', 'cms-admin')->firstOrFail(), 'sanctum')
            ->get('/api/cms/task-usage/export?location=GBB&start_date=2026-11-01&end_date=2026-11-10&sort_by=frequency&sort_direction=desc')
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    public function test_export_requires_work_station_permission(): void
    {
        $role = Role::create(['name' => 'limited cms', 'permissions' => ['users_locations']]);
        $user = User::create([
            'username' => 'limited-admin',
            'name' => 'Limited Admin',
            'role_id' => $role->id,
            'active' => true,
        ]);

        $this->actingAs($user, 'sanctum')
            ->get('/api/cms/task-usage/export?start_date=2026-11-01&end_date=2026-11-10&sort_by=frequency&sort_direction=desc')
            ->assertForbidden();
    }

    private function seedData(): void
    {
        $role = Role::create(['name' => 'admin', 'permissions' => ['work_stations']]);
        User::create([
            'username' => 'cms-admin',
            'name' => 'CMS Admin',
            'role_id' => $role->id,
            'active' => true,
        ]);
        User::create([
            'username' => 'spv-1',
            'name' => 'Supervisor Satu',
            'initial_store' => 'GBB',
            'active' => true,
        ]);
        foreach (['crew-1', 'crew-2'] as $crew) {
            User::create(['username' => $crew, 'name' => $crew, 'initial_store' => 'GBB', 'active' => true]);
        }

        DB::table('locations')->insert(['initial' => 'GBB', 'name' => 'GRIYA BUAH BATU']);
        DB::table('user_locations')->insert(['user_id' => 'spv-1', 'location_id' => 'GBB', 'job_level' => 'supervisor']);
        $stationId = DB::table('work_stations')->insertGetId(['name' => 'Service Crew', 'active' => true]);
        $areaId = DB::table('task_areas')->insertGetId(['work_station_id' => $stationId, 'name' => 'Fashion', 'active' => true]);
        $displayId = DB::table('task_definitions')->insertGetId(['task_area_id' => $areaId, 'title' => 'Display', 'active' => true]);
        $stockId = DB::table('task_definitions')->insertGetId(['task_area_id' => $areaId, 'title' => 'Stock Opname', 'active' => true]);

        $tasks = [
            [$displayId, 10, 'crew-1', '2026-11-02 08:00:00'],
            [$displayId, 10, 'crew-2', '2026-11-02 08:00:00'],
            [$displayId, 10, 'crew-1', '2026-11-03 08:00:00'],
            [$displayId, 10, 'crew-2', '2026-11-03 08:00:00'],
            [$displayId, null, 'crew-1', '2026-11-04 08:00:00'],
            [$stockId, null, 'crew-2', '2026-11-05 08:00:00'],
        ];
        foreach ($tasks as [$definitionId, $batchId, $crew, $startAt]) {
            DB::table('tasks')->insert([
                'employee_id' => $crew,
                'employer_id' => 'spv-1',
                'work_station_id' => $stationId,
                'task_definition_id' => $definitionId,
                'assignment_batch_id' => $batchId,
                'title' => $definitionId === $displayId ? 'Display' : 'Stock Opname',
                'start_at' => $startAt,
                'created_at' => $startAt,
                'updated_at' => $startAt,
            ]);
        }
    }

    private function createSchema(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->text('permissions')->nullable();
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->unique();
            $table->string('name');
            $table->foreignId('role_id')->nullable();
            $table->string('initial_store')->nullable();
            $table->boolean('active')->default(true);
            $table->boolean('is_back_office')->default(false);
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
            $table->string('location_id');
            $table->string('job_level')->nullable();
        });
        Schema::create('work_stations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('active')->default(true);
        });
        Schema::create('task_areas', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('work_station_id');
            $table->string('name');
            $table->boolean('active')->default(true);
        });
        Schema::create('task_definitions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_area_id');
            $table->string('title');
            $table->boolean('active')->default(true);
        });
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('employee_id');
            $table->string('employer_id');
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->unsignedBigInteger('task_definition_id')->nullable();
            $table->unsignedBigInteger('assignment_batch_id')->nullable();
            $table->string('title');
            $table->dateTime('start_at')->nullable();
            $table->timestamps();
        });
    }
}
