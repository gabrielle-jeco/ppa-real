<?php

namespace Tests\Feature;

use App\Models\TaskArea;
use App\Models\TaskDefinition;
use App\Models\User;
use App\Models\WorkStation;
use App\Services\UserNotificationService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery\MockInterface;
use Tests\TestCase;

class TaskCatalogAssignmentTest extends TestCase
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
            $table->unsignedBigInteger('role_id')->nullable();
            $table->boolean('active')->default(true);
            $table->boolean('is_back_office')->default(false);
            $table->timestamps();
        });
        Schema::create('user_locations', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('job_level')->nullable();
        });
        Schema::create('reporting_lines', function (Blueprint $table) {
            $table->id();
            $table->string('leader_id');
            $table->string('subordinate_id');
            $table->string('status');
            $table->string('relation_type')->default('permanent');
            $table->unsignedBigInteger('backup_request_id')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_until')->nullable();
        });
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
        Schema::create('task_assignment_batches', function (Blueprint $table) {
            $table->id();
            $table->string('created_by');
            $table->string('assignment_type');
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->unsignedBigInteger('task_definition_id')->nullable();
            $table->date('start_date');
            $table->date('end_date');
            $table->time('start_time');
            $table->time('due_time');
            $table->json('repeat_days')->nullable();
            $table->string('weight_label')->nullable();
            $table->unsignedInteger('weight_value')->nullable();
            $table->json('crew_ids')->nullable();
            $table->timestamps();
        });
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('employee_id');
            $table->string('employer_id');
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->unsignedBigInteger('task_definition_id')->nullable();
            $table->unsignedBigInteger('assignment_batch_id')->nullable();
            $table->string('assignment_type');
            $table->string('title');
            $table->text('description')->nullable();
            $table->dateTime('start_at')->nullable();
            $table->dateTime('due_at');
            $table->dateTime('approval_deadline_at')->nullable();
            $table->dateTime('revision_deadline_at')->nullable();
            $table->string('weight_label')->nullable();
            $table->unsignedInteger('weight_value')->nullable();
            $table->string('status');
            $table->timestamps();
        });
        Schema::create('task_evidences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->string('file_path');
            $table->string('type');
            $table->unsignedTinyInteger('attempt_no')->nullable();
            $table->string('review_status')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->string('reviewed_by')->nullable();
            $table->dateTime('reviewed_at')->nullable();
            $table->decimal('awarded_score', 5, 2)->nullable();
            $table->timestamps();
        });

        DB::table('users')->insert([
            ['username' => 'spv-1', 'name' => 'Supervisor', 'active' => true, 'is_back_office' => false, 'created_at' => now(), 'updated_at' => now()],
            ['username' => 'crew-1', 'name' => 'Crew', 'active' => true, 'is_back_office' => false, 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('user_locations')->insert([
            ['user_id' => 'spv-1', 'job_level' => 'supervisor'],
            ['user_id' => 'crew-1', 'job_level' => 'sc'],
        ]);
        DB::table('reporting_lines')->insert([
            'leader_id' => 'spv-1',
            'subordinate_id' => 'crew-1',
            'status' => 'active',
            'relation_type' => 'permanent',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-10-09 10:00:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_individual_task_identity_is_derived_from_active_master(): void
    {
        [$definition, $otherStation] = $this->catalogDefinition();
        $this->mockNotifications(1);

        $this->actingAs($this->supervisor(), 'sanctum')
            ->postJson('/api/tasks', [
                'supervisor_id' => 'crew-1',
                'task_definition_id' => $definition->id,
                'title' => 'Judul palsu',
                'work_station_id' => $otherStation->id,
                'start_at' => '2026-10-09 11:00:00',
                'due_at' => '2026-10-09 20:00:00',
                'note' => 'Catatan tetap bebas.',
            ])
            ->assertCreated()
            ->assertJsonPath('title', 'Kebersihan area display')
            ->assertJsonPath('task_definition_id', $definition->id);

        $this->assertDatabaseHas('tasks', [
            'employee_id' => 'crew-1',
            'task_definition_id' => $definition->id,
            'work_station_id' => $definition->taskArea->work_station_id,
            'title' => 'Kebersihan area display',
            'description' => 'Catatan tetap bebas.',
        ]);
    }

    public function test_inactive_master_cannot_be_used_for_new_task(): void
    {
        [$definition] = $this->catalogDefinition();
        $definition->update(['active' => false]);

        $this->actingAs($this->supervisor(), 'sanctum')
            ->postJson('/api/tasks', [
                'supervisor_id' => 'crew-1',
                'task_definition_id' => $definition->id,
                'start_at' => '2026-10-09 11:00:00',
                'due_at' => '2026-10-09 20:00:00',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('task_definition_id');
    }

    public function test_bulk_assignment_copies_master_identity_to_batch_and_tasks(): void
    {
        [$definition] = $this->catalogDefinition();
        $this->mockNotifications(1);

        $this->actingAs($this->supervisor(), 'sanctum')
            ->postJson('/api/tasks/bulk', [
                'crew_ids' => ['crew-1'],
                'task_definition_id' => $definition->id,
                'start_date' => '2026-10-10',
                'end_date' => '2026-10-11',
                'repeat_days' => [],
                'start_time' => '08:00',
                'due_time' => '20:00',
                'note' => 'Dikerjakan dua hari.',
            ])
            ->assertCreated()
            ->assertJsonPath('created', 2);

        $this->assertDatabaseHas('task_assignment_batches', [
            'task_definition_id' => $definition->id,
            'work_station_id' => $definition->taskArea->work_station_id,
            'title' => 'Kebersihan area display',
        ]);
        $this->assertSame(2, DB::table('tasks')->where('task_definition_id', $definition->id)->count());
        $this->assertSame(0, DB::table('tasks')->where('title', '!=', 'Kebersihan area display')->count());
    }

    private function catalogDefinition(): array
    {
        $station = WorkStation::create(['name' => 'sc', 'guide_content' => [], 'active' => true]);
        $otherStation = WorkStation::create(['name' => 'cashier', 'guide_content' => [], 'active' => true]);
        $area = TaskArea::create(['work_station_id' => $station->id, 'name' => 'FRESH', 'sort_order' => 10, 'active' => true]);
        $definition = TaskDefinition::create([
            'task_area_id' => $area->id,
            'title' => 'Kebersihan area display',
            'sort_order' => 10,
            'active' => true,
        ]);

        return [$definition->load('taskArea'), $otherStation];
    }

    private function supervisor(): User
    {
        $supervisor = User::where('username', 'spv-1')->firstOrFail();
        $supervisor->setRelation('accountRole', null);
        $supervisor->load('userLocations');

        return $supervisor;
    }

    private function mockNotifications(int $times): void
    {
        $this->mock(UserNotificationService::class, function (MockInterface $mock) use ($times) {
            $mock->shouldReceive('createAndPush')->times($times);
        });
    }
}
