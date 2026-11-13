<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\TaskEvidence;
use App\Models\User;
use App\Http\Controllers\TaskController;
use App\Services\UserNotificationService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;
use Mockery;
use ReflectionMethod;
use Tests\TestCase;
use Illuminate\Validation\ValidationException;

class TaskReviewWorkflowTest extends TestCase
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

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('username')->unique();
            $table->string('password');
            $table->boolean('active')->default(true);
            $table->boolean('is_back_office')->default(false);
            $table->timestamps();
        });
        Schema::create('user_locations', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('location_id')->nullable();
            $table->string('job_level')->nullable();
            $table->timestamps();
        });
        Schema::create('reporting_lines', function (Blueprint $table) {
            $table->id();
            $table->string('leader_id');
            $table->string('subordinate_id');
            $table->string('status')->default('active');
            $table->string('relation_type')->default('permanent');
            $table->date('effective_from')->nullable();
            $table->date('effective_until')->nullable();
            $table->timestamps();
        });
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('employee_id');
            $table->string('employer_id');
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->dateTime('start_at')->nullable();
            $table->dateTime('due_at');
            $table->dateTime('approval_deadline_at')->nullable();
            $table->dateTime('revision_deadline_at')->nullable();
            $table->string('status')->default('pending');
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
        Schema::create('work_stations', function (Blueprint $table) {
            $table->id();
        });
        Schema::create('task_definitions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_area_id')->nullable();
            $table->string('title')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('task_assignment_batches', function (Blueprint $table) {
            $table->id();
        });

        Carbon::setTestNow(Carbon::parse('2026-10-09 22:00:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_reject_requires_a_note_and_records_the_review_on_latest_after(): void
    {
        [$reviewer, $task] = $this->taskWithAttempt(1, true);

        $this->actingAs($reviewer, 'sanctum')
            ->postJson('/api/tasks/' . $task->id . '/reject', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('note');

        $this->mockNotifications();

        $this->actingAs($reviewer, 'sanctum')
            ->postJson('/api/tasks/' . $task->id . '/reject', ['note' => 'Foto area belum bersih.'])
            ->assertOk()
            ->assertJsonPath('status', 'rejected')
            ->assertJsonPath('review_summary.current_attempt', 1)
            ->assertJsonPath('review_summary.potential_score', 67);

        $this->assertDatabaseHas('task_evidences', [
            'task_id' => $task->id,
            'attempt_no' => 1,
            'review_status' => 'rejected',
            'rejection_reason' => 'Foto area belum bersih.',
            'reviewed_by' => 'supervisor-1',
            'awarded_score' => 0,
        ]);
    }

    public function test_retry_reject_is_locked_after_cutoff_but_third_attempt_can_be_rejected_until_approval_deadline(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-09 23:15:00', 'Asia/Jakarta'));
        [$reviewer, $secondAttemptTask] = $this->taskWithAttempt(2);

        $this->actingAs($reviewer, 'sanctum')
            ->postJson('/api/tasks/' . $secondAttemptTask->id . '/reject', ['note' => 'Perlu revisi lagi.'])
            ->assertUnprocessable();

        [$reviewer, $thirdAttemptTask] = $this->taskWithAttempt(3);
        $this->mockNotifications();

        $this->actingAs($reviewer, 'sanctum')
            ->postJson('/api/tasks/' . $thirdAttemptTask->id . '/reject', ['note' => 'Hasil akhir belum sesuai.'])
            ->assertOk()
            ->assertJsonPath('review_summary.potential_score', 0)
            ->assertJsonPath('review_summary.can_upload_after', false)
            ->assertJsonPath('review_summary.can_delete', false);

        $this->actingAs($reviewer, 'sanctum')
            ->deleteJson('/api/tasks/' . $thirdAttemptTask->id)
            ->assertBadRequest();
    }

    public function test_approval_awards_attempt_score_and_uncheck_returns_evidence_to_pending(): void
    {
        [$reviewer, $task] = $this->taskWithAttempt(2, true);
        $notifications = $this->mockNotifications(2);
        $notifications->shouldReceive('refreshAggregate')->twice()->andReturnNull();

        $this->actingAs($reviewer, 'sanctum')
            ->patchJson('/api/tasks/' . $task->id . '/status', ['status' => 'approved'])
            ->assertOk()
            ->assertJsonPath('status', 'approved')
            ->assertJsonPath('review_summary.potential_score', 67)
            ->assertJsonPath('review_summary.can_delete', false);

        $this->assertDatabaseHas('task_evidences', [
            'task_id' => $task->id,
            'attempt_no' => 2,
            'review_status' => 'approved',
            'awarded_score' => 67,
        ]);

        $this->actingAs($reviewer, 'sanctum')
            ->patchJson('/api/tasks/' . $task->id . '/status', ['status' => 'pending'])
            ->assertOk()
            ->assertJsonPath('review_summary.latest_after_status', 'pending')
            ->assertJsonPath('review_summary.can_delete', true);

        $this->assertDatabaseHas('task_evidences', [
            'task_id' => $task->id,
            'attempt_no' => 2,
            'review_status' => 'pending',
            'awarded_score' => null,
        ]);
    }

    public function test_after_uploads_are_sequential_and_require_rejection_before_the_next_attempt(): void
    {
        Storage::fake('public');
        $crew = new User(['username' => 'crew-1']);
        $crew->setRelation('accountRole', null);
        $crew->setRelation('userLocations', collect());
        $crew->setRelation('locations', collect());
        $task = Task::create([
            'employee_id' => 'crew-1',
            'employer_id' => 'supervisor-1',
            'title' => 'Rapikan area kasir',
            'start_at' => '2026-10-09 08:00:00',
            'due_at' => '2026-10-09 22:30:00',
            'approval_deadline_at' => '2026-10-09 23:59:59',
            'revision_deadline_at' => '2026-10-09 23:29:59',
            'status' => 'pending',
        ]);
        $notifications = Mockery::mock(UserNotificationService::class);
        $notifications->shouldReceive('createOrRefreshAggregateAndPush')->twice()->andReturnNull();
        $this->app->instance(UserNotificationService::class, $notifications);

        $this->actingAs($crew, 'sanctum')
            ->post('/api/tasks/' . $task->id . '/evidence', [
                'after' => [$this->fakeImage('after-1.png')],
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('review_summary.current_attempt', 1);

        $this->actingAs($crew, 'sanctum')
            ->post('/api/tasks/' . $task->id . '/evidence', [
                'after' => [$this->fakeImage('after-direct.png')],
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable();

        TaskEvidence::where('task_id', $task->id)->where('attempt_no', 1)->update([
            'review_status' => 'rejected',
            'rejection_reason' => 'Ulangi foto.',
        ]);
        $task->update(['status' => 'rejected']);

        $this->actingAs($crew, 'sanctum')
            ->post('/api/tasks/' . $task->id . '/evidence', [
                'after' => [$this->fakeImage('after-2.png')],
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('status', 'pending')
            ->assertJsonPath('review_summary.current_attempt', 2)
            ->assertJsonPath('review_summary.potential_score', 0);

        $this->assertDatabaseHas('task_evidences', [
            'task_id' => $task->id,
            'attempt_no' => 2,
            'review_status' => 'pending',
        ]);
    }

    public function test_normal_task_due_time_must_leave_the_minimum_revision_window(): void
    {
        $method = new ReflectionMethod(TaskController::class, 'validateRevisionWindow');
        $method->setAccessible(true);
        $supervisor = new User(['is_back_office' => false]);

        $this->expectException(ValidationException::class);
        $method->invoke(
            app(TaskController::class),
            $supervisor,
            Carbon::parse('2026-10-09 23:00:00', 'Asia/Jakarta')
        );
    }

    public function test_back_office_task_can_use_a_later_due_time(): void
    {
        $method = new ReflectionMethod(TaskController::class, 'validateRevisionWindow');
        $method->setAccessible(true);

        $method->invoke(
            app(TaskController::class),
            new User(['is_back_office' => true]),
            Carbon::parse('2026-10-09 23:30:00', 'Asia/Jakarta')
        );

        $this->addToAssertionCount(1);
    }

    public function test_manager_can_edit_and_delete_tasks_from_a_direct_supervisor_but_not_approved_tasks(): void
    {
        $manager = User::create(['name' => 'Manager', 'username' => 'manager-1', 'password' => 'password']);
        $supervisor = User::create(['name' => 'Supervisor', 'username' => 'supervisor-1', 'password' => 'password']);
        User::create(['name' => 'Crew', 'username' => 'crew-1', 'password' => 'password']);
        DB::table('user_locations')->insert([
            ['user_id' => $manager->username, 'job_level' => 'manager'],
            ['user_id' => $supervisor->username, 'job_level' => 'supervisor'],
            ['user_id' => 'crew-1', 'job_level' => 'sc'],
        ]);
        DB::table('reporting_lines')->insert([
            'leader_id' => $manager->username,
            'subordinate_id' => $supervisor->username,
            'status' => 'active',
            'relation_type' => 'permanent',
        ]);
        $manager->load('userLocations');

        $task = Task::create([
            'employee_id' => 'crew-1',
            'employer_id' => $supervisor->username,
            'title' => 'Rapikan display',
            'start_at' => '2026-10-09 08:00:00',
            'due_at' => '2026-10-09 22:30:00',
            'status' => 'pending',
        ]);
        $this->mockNotifications(2);

        $this->actingAs($manager, 'sanctum')
            ->patchJson('/api/tasks/' . $task->id, ['due_at' => '2026-10-09 22:45:00', 'note' => 'Prioritas area depan'])
            ->assertOk()
            ->assertJsonPath('note', 'Prioritas area depan');

        Carbon::setTestNow(Carbon::parse('2026-10-09 22:46:00', 'Asia/Jakarta'));
        $this->actingAs($manager, 'sanctum')
            ->patchJson('/api/tasks/' . $task->id, ['due_at' => '2026-10-09 23:00:00'])
            ->assertBadRequest()
            ->assertJsonPath('message', 'Tugas ini sudah melewati tenggat dan tidak dapat diedit.');
        Carbon::setTestNow(Carbon::parse('2026-10-09 22:00:00', 'Asia/Jakarta'));

        $this->actingAs($manager, 'sanctum')
            ->patchJson('/api/tasks/' . $task->id . '/status', ['status' => 'approved'])
            ->assertForbidden();

        $this->actingAs($manager, 'sanctum')
            ->deleteJson('/api/tasks/' . $task->id)
            ->assertOk();
        $this->assertDatabaseMissing('tasks', ['id' => $task->id]);

        $approvedTask = Task::create([
            'employee_id' => 'crew-1',
            'employer_id' => $supervisor->username,
            'title' => 'Tugas selesai',
            'start_at' => '2026-10-09 08:00:00',
            'due_at' => '2026-10-09 22:30:00',
            'status' => 'approved',
        ]);

        $this->actingAs($manager, 'sanctum')
            ->patchJson('/api/tasks/' . $approvedTask->id, ['note' => 'Tidak boleh'])
            ->assertBadRequest();
        $this->actingAs($manager, 'sanctum')
            ->deleteJson('/api/tasks/' . $approvedTask->id)
            ->assertBadRequest();
    }

    public function test_expired_evidence_upload_returns_diagnostic_context(): void
    {
        Storage::fake('public');
        Carbon::setTestNow(Carbon::parse('2026-10-09 22:31:00', 'Asia/Jakarta'));

        $crew = new User(['username' => 'crew-1']);
        $crew->setRelation('accountRole', null);
        $crew->setRelation('userLocations', collect());
        $crew->setRelation('locations', collect());
        $task = Task::create([
            'employee_id' => 'crew-1',
            'employer_id' => 'supervisor-1',
            'title' => 'Rapikan area kasir',
            'start_at' => '2026-10-09 08:00:00',
            'due_at' => '2026-10-09 22:30:00',
            'approval_deadline_at' => '2026-10-09 23:59:59',
            'revision_deadline_at' => '2026-10-09 23:29:59',
            'status' => 'pending',
        ]);

        $response = $this->actingAs($crew, 'sanctum')
            ->post('/api/tasks/' . $task->id . '/evidence', [
                'after' => [$this->fakeImage('late-after.png')],
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('error_code', 'EVIDENCE_UPLOAD_REJECTED')
            ->assertJsonPath('task_id', $task->id)
            ->assertJsonPath('server_time', '2026-10-09T15:31:00.000000Z')
            ->assertJsonPath('due_at', '2026-10-09T15:30:00.000000Z')
            ->assertJsonStructure(['message', 'reference_id', 'errors']);

        $this->assertSame(10, strlen($response->json('reference_id')));
        $this->assertDatabaseMissing('task_evidences', ['task_id' => $task->id]);
    }

    private function taskWithAttempt(int $attemptNo, bool $withBefore = false): array
    {
        $reviewer = new User(['username' => 'supervisor-1']);
        $reviewer->setRelation('accountRole', null);
        $task = Task::create([
            'employee_id' => 'crew-1',
            'employer_id' => 'supervisor-1',
            'title' => 'Rapikan area kasir',
            'due_at' => '2026-10-09 20:00:00',
            'approval_deadline_at' => '2026-10-09 23:59:59',
            'revision_deadline_at' => '2026-10-09 23:29:59',
            'status' => 'pending',
        ]);

        if ($withBefore) {
            TaskEvidence::create([
                'task_id' => $task->id,
                'file_path' => 'tasks/before.jpg',
                'type' => 'before',
            ]);
        }

        TaskEvidence::create([
            'task_id' => $task->id,
            'file_path' => 'tasks/after-' . $attemptNo . '.jpg',
            'type' => 'after',
            'attempt_no' => $attemptNo,
            'review_status' => 'pending',
        ]);

        return [$reviewer, $task];
    }

    private function mockNotifications(int $statusNotifications = 1): UserNotificationService
    {
        $notifications = Mockery::mock(UserNotificationService::class);
        $notifications->shouldReceive('createAndPush')->times($statusNotifications)->andReturnNull();
        if ($statusNotifications === 1) {
            $notifications->shouldReceive('refreshAggregate')->once()->andReturnNull();
        }
        $this->app->instance(UserNotificationService::class, $notifications);

        return $notifications;
    }

    private function fakeImage(string $name): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $name,
            base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
        );
    }
}
