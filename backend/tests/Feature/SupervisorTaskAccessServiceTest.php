<?php

namespace Tests\Feature;

use App\Models\SupervisorBackupAssignment;
use App\Models\SupervisorBackupRequest;
use App\Models\Task;
use App\Models\User;
use App\Models\UserLocation;
use App\Services\SupervisorTaskAccessService;
use App\Services\UserNotificationService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

class SupervisorTaskAccessServiceTest extends TestCase
{
    private SupervisorTaskAccessService $service;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
        ]);
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('employee_id');
            $table->string('employer_id');
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->dateTime('start_at')->nullable();
            $table->dateTime('due_at')->nullable();
            $table->dateTime('approval_deadline_at')->nullable();
            $table->string('status')->default('pending');
            $table->timestamps();
        });
        Schema::create('task_evidences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->timestamps();
        });
        Schema::create('supervisor_backup_requests', function (Blueprint $table) {
            $table->id();
            $table->string('requester_id');
            $table->string('backup_supervisor_id');
            $table->date('start_date');
            $table->date('end_date');
            $table->string('status');
            $table->timestamp('responded_at')->nullable();
            $table->text('reason')->nullable();
            $table->timestamps();
        });
        Schema::create('supervisor_backup_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('backup_request_id');
            $table->string('subordinate_id');
            $table->unsignedBigInteger('reporting_line_id')->nullable();
            $table->boolean('created_temporary_line')->default(false);
            $table->timestamps();
        });

        Carbon::setTestNow(Carbon::parse('2026-09-15 10:00:00', 'Asia/Jakarta'));
        $this->service = new SupervisorTaskAccessService();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_task_creator_can_always_review_own_task(): void
    {
        $reviewer = $this->supervisor('primary');
        $task = new Task(['employee_id' => 'crew-1', 'employer_id' => 'primary']);

        $this->assertTrue($this->service->canReviewTask($reviewer, $task, Carbon::today()));
    }

    public function test_active_backup_can_only_review_the_requesters_assigned_crew(): void
    {
        $reviewer = $this->supervisor('backup');
        $this->createBackup('primary', 'backup', 'crew-1', 'approved', '2026-09-10', '2026-09-20');

        $this->assertTrue($this->service->canReviewTask(
            $reviewer,
            new Task(['employee_id' => 'crew-1', 'employer_id' => 'primary']),
            Carbon::today()
        ));
        $this->assertFalse($this->service->canReviewTask(
            $reviewer,
            new Task(['employee_id' => 'crew-2', 'employer_id' => 'primary']),
            Carbon::today()
        ));
        $this->assertFalse($this->service->canReviewTask(
            $reviewer,
            new Task(['employee_id' => 'crew-1', 'employer_id' => 'other-supervisor']),
            Carbon::today()
        ));
    }

    /**
     * @dataProvider inactiveBackupProvider
     */
    public function test_inactive_backup_cannot_review_tasks(
        string $status,
        string $startDate,
        string $endDate
    ): void {
        $reviewer = $this->supervisor('backup');
        $this->createBackup('primary', 'backup', 'crew-1', $status, $startDate, $endDate);

        $this->assertFalse($this->service->canReviewTask(
            $reviewer,
            new Task(['employee_id' => 'crew-1', 'employer_id' => 'primary']),
            Carbon::today()
        ));
    }

    public function inactiveBackupProvider(): array
    {
        return [
            'pending request' => ['pending', '2026-09-10', '2026-09-20'],
            'rejected request' => ['rejected', '2026-09-10', '2026-09-20'],
            'not started' => ['approved', '2026-09-16', '2026-09-20'],
            'expired' => ['approved', '2026-09-01', '2026-09-14'],
        ];
    }

    public function test_task_scope_does_not_mix_crews_and_requesters(): void
    {
        $reviewer = $this->supervisor('backup');
        $this->createBackup('primary', 'backup', 'crew-1', 'approved', '2026-09-10', '2026-09-20');

        $own = Task::create(['employee_id' => 'crew-2', 'employer_id' => 'backup', 'title' => 'Own']);
        $covered = Task::create(['employee_id' => 'crew-1', 'employer_id' => 'primary', 'title' => 'Covered']);
        Task::create(['employee_id' => 'crew-2', 'employer_id' => 'primary', 'title' => 'Wrong crew']);
        Task::create(['employee_id' => 'crew-1', 'employer_id' => 'other', 'title' => 'Wrong requester']);

        $pairs = $this->service->reviewableBackupPairs(
            $reviewer,
            ['crew-1', 'crew-2'],
            Carbon::today()
        );
        $query = Task::query();
        $this->service->constrainReviewableTasks($query, $reviewer, $pairs);

        $this->assertSame([$own->id, $covered->id], $query->orderBy('id')->pluck('id')->all());
    }

    public function test_active_backup_can_approve_through_the_task_endpoint(): void
    {
        $reviewer = $this->supervisor('backup');
        $this->createBackup('primary', 'backup', 'crew-1', 'approved', '2026-09-10', '2026-09-20');
        $task = Task::create([
            'employee_id' => 'crew-1',
            'employer_id' => 'primary',
            'title' => 'Covered task',
            'due_at' => '2026-09-15 12:00:00',
            'approval_deadline_at' => '2026-09-15 23:59:59',
            'status' => 'pending',
        ]);

        $notifications = Mockery::mock(UserNotificationService::class);
        $notifications->shouldReceive('createAndPush')->once()->andReturnNull();
        $notifications->shouldReceive('refreshAggregate')->once()->andReturnNull();
        $this->app->instance(UserNotificationService::class, $notifications);

        $this->actingAs($reviewer, 'sanctum')
            ->patchJson('/api/tasks/' . $task->id . '/status', ['status' => 'approved'])
            ->assertOk()
            ->assertJsonPath('status', 'approved');

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'status' => 'approved',
        ]);
    }

    private function supervisor(string $username): User
    {
        $user = new User(['username' => $username]);
        $user->setRelation('accountRole', null);
        $user->setRelation('userLocations', collect([
            new UserLocation(['job_level' => 'supervisor']),
        ]));

        return $user;
    }

    private function createBackup(
        string $requester,
        string $backup,
        string $crew,
        string $status,
        string $startDate,
        string $endDate
    ): void {
        $request = SupervisorBackupRequest::create([
            'requester_id' => $requester,
            'backup_supervisor_id' => $backup,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'status' => $status,
        ]);

        SupervisorBackupAssignment::create([
            'backup_request_id' => $request->id,
            'subordinate_id' => $crew,
        ]);
    }
}
