<?php

namespace Tests\Feature;

use App\Models\ReportingLine;
use App\Models\SupervisorBackupRequest;
use App\Models\Task;
use App\Models\User;
use App\Models\UserLocation;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SupervisorCrewListTest extends TestCase
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
            $table->unsignedBigInteger('role_id')->nullable();
            $table->unsignedBigInteger('job_level_id')->nullable();
            $table->string('initial_store')->nullable();
            $table->boolean('active')->default(true);
            $table->boolean('is_back_office')->default(false);
            $table->timestamps();
        });
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('initial')->unique();
            $table->string('name');
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
            $table->unsignedBigInteger('backup_request_id')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_until')->nullable();
            $table->timestamps();
        });
        $this->createBackupTables();
        Schema::create('attendances', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('date');
            $table->string('status_code');
            $table->timestamps();
        });
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('employee_id');
            $table->string('employer_id');
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->unsignedBigInteger('assignment_batch_id')->nullable();
            $table->string('title')->nullable();
            $table->dateTime('start_at')->nullable();
            $table->dateTime('due_at');
            $table->dateTime('revision_deadline_at')->nullable();
            $table->string('status')->default('pending');
            $table->timestamps();
        });
        Schema::create('task_evidences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->string('file_path')->nullable();
            $table->string('type');
            $table->unsignedTinyInteger('attempt_no')->nullable();
            $table->string('review_status')->nullable();
            $table->decimal('awarded_score', 5, 2)->nullable();
            $table->timestamps();
        });
        Schema::create('monthly_personality_evaluations', function (Blueprint $table) {
            $table->id();
            $table->string('evaluatee_id');
            $table->string('evaluator_id');
            $table->date('evaluation_period');
            $table->string('evaluation_type')->default('personality');
            $table->double('score');
            $table->json('scores')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
        Schema::create('work_stations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('guide_reads', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->unsignedBigInteger('work_station_id');
            $table->date('read_date');
            $table->timestamps();
        });
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->timestamps();
        });

        DB::table('locations')->insert([
            'initial' => 'GBB',
            'name' => 'Griya Buah Batu',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-10-15 10:00:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_supervisor_crews_excludes_inactive_permanent_lines_and_keeps_active_permanent_team(): void
    {
        $supervisor = $this->createUser('spv-1', 'supervisor');
        $activeCrew = $this->createUser('crew-active', 'sc');
        $inactiveCrew = $this->createUser('crew-inactive', 'sc');

        $this->createLine($supervisor, $activeCrew, 'active', 'permanent');
        $this->createLine($supervisor, $inactiveCrew, 'inactive', 'permanent');

        Task::create([
            'employee_id' => $activeCrew->username,
            'employer_id' => $supervisor->username,
            'title' => 'Approved Active Task',
            'start_at' => '2026-10-15 08:00:00',
            'due_at' => '2026-10-15 18:00:00',
            'status' => 'approved',
        ]);
        Task::create([
            'employee_id' => $inactiveCrew->username,
            'employer_id' => $supervisor->username,
            'title' => 'Pending Inactive Task',
            'start_at' => '2026-10-15 08:00:00',
            'due_at' => '2026-10-15 18:00:00',
            'status' => 'pending',
        ]);

        $response = $this->actingAs($supervisor, 'sanctum')
            ->getJson('/api/supervisor/crews')
            ->assertOk()
            ->assertJsonCount(1, 'crews')
            ->assertJsonPath('crews.0.id', 'crew-active')
            ->assertJsonPath('crews.0.task_progress', 100)
            ->assertJsonPath('location_avg_progress', 100);

        $this->assertNotContains('crew-inactive', array_column($response->json('crews'), 'id'));
    }

    public function test_supervisor_crews_includes_effective_backup_and_excludes_expired_or_inactive_source_backups(): void
    {
        $backupSupervisor = $this->createUser('spv-backup', 'supervisor');
        $requester = $this->createUser('spv-requester', 'supervisor');
        $inactiveSourceRequester = $this->createUser('spv-inactive-src', 'supervisor');

        $effectiveBackupCrew = $this->createUser('crew-backup-ok', 'sc');
        $expiredBackupCrew = $this->createUser('crew-backup-expired', 'sc');
        $inactiveSourceCrew = $this->createUser('crew-backup-inactive-src', 'sc');

        $this->createLine($requester, $effectiveBackupCrew, 'active', 'permanent');
        $this->createLine($requester, $expiredBackupCrew, 'active', 'permanent');
        $this->createLine($inactiveSourceRequester, $inactiveSourceCrew, 'inactive', 'permanent');

        $activeRequest = SupervisorBackupRequest::create([
            'requester_id' => $requester->username,
            'backup_supervisor_id' => $backupSupervisor->username,
            'start_date' => '2026-10-14',
            'end_date' => '2026-10-16',
            'status' => 'approved',
        ]);
        $expiredRequest = SupervisorBackupRequest::create([
            'requester_id' => $requester->username,
            'backup_supervisor_id' => $backupSupervisor->username,
            'start_date' => '2026-10-01',
            'end_date' => '2026-10-10',
            'status' => 'approved',
        ]);
        $inactiveSourceRequest = SupervisorBackupRequest::create([
            'requester_id' => $inactiveSourceRequester->username,
            'backup_supervisor_id' => $backupSupervisor->username,
            'start_date' => '2026-10-14',
            'end_date' => '2026-10-16',
            'status' => 'approved',
        ]);

        ReportingLine::withoutGlobalScope('effective_backup_period')->create([
            'leader_id' => $backupSupervisor->username,
            'subordinate_id' => $effectiveBackupCrew->username,
            'status' => 'active',
            'relation_type' => 'backup',
            'backup_request_id' => $activeRequest->id,
            'effective_from' => '2026-10-14',
            'effective_until' => '2026-10-16',
        ]);
        ReportingLine::withoutGlobalScope('effective_backup_period')->create([
            'leader_id' => $backupSupervisor->username,
            'subordinate_id' => $expiredBackupCrew->username,
            'status' => 'active',
            'relation_type' => 'backup',
            'backup_request_id' => $expiredRequest->id,
            'effective_from' => '2026-10-01',
            'effective_until' => '2026-10-10',
        ]);
        ReportingLine::withoutGlobalScope('effective_backup_period')->create([
            'leader_id' => $backupSupervisor->username,
            'subordinate_id' => $inactiveSourceCrew->username,
            'status' => 'active',
            'relation_type' => 'backup',
            'backup_request_id' => $inactiveSourceRequest->id,
            'effective_from' => '2026-10-14',
            'effective_until' => '2026-10-16',
        ]);

        DB::table('supervisor_backup_assignments')->insert([
            [
                'backup_request_id' => $activeRequest->id,
                'subordinate_id' => $effectiveBackupCrew->username,
                'created_temporary_line' => true,
            ],
            [
                'backup_request_id' => $expiredRequest->id,
                'subordinate_id' => $expiredBackupCrew->username,
                'created_temporary_line' => true,
            ],
            [
                'backup_request_id' => $inactiveSourceRequest->id,
                'subordinate_id' => $inactiveSourceCrew->username,
                'created_temporary_line' => true,
            ],
        ]);

        Task::create([
            'employee_id' => $effectiveBackupCrew->username,
            'employer_id' => $requester->username,
            'title' => 'Requester Task',
            'start_at' => '2026-10-15 08:00:00',
            'due_at' => '2026-10-15 18:00:00',
            'status' => 'approved',
        ]);

        $this->actingAs($backupSupervisor, 'sanctum')
            ->getJson('/api/supervisor/crews')
            ->assertOk()
            ->assertJsonCount(1, 'crews')
            ->assertJsonPath('crews.0.id', 'crew-backup-ok')
            ->assertJsonPath('crews.0.has_tasks', true)
            ->assertJsonPath('crews.0.task_progress', 100);
    }

    public function test_non_supervisor_cannot_access_supervisor_crews(): void
    {
        $crew = $this->createUser('crew-1', 'sc');
        $manager = $this->createUser('manager-1', 'manager');

        $this->actingAs($crew, 'sanctum')->getJson('/api/supervisor/crews')->assertForbidden();
        $this->actingAs($manager, 'sanctum')->getJson('/api/supervisor/crews')->assertForbidden();
    }

    private function createUser(string $username, string $jobLevel): User
    {
        $user = User::create([
            'name' => $username,
            'username' => $username,
            'password' => 'password',
            'initial_store' => 'GBB',
            'active' => true,
        ]);
        UserLocation::create([
            'user_id' => $username,
            'location_id' => 'GBB',
            'job_level' => $jobLevel,
        ]);
        $user->setRelation('accountRole', null);
        $user->load(['userLocations', 'locations']);

        return $user;
    }

    private function createLine(
        User $leader,
        User $subordinate,
        string $status,
        string $relationType
    ): ReportingLine {
        return ReportingLine::withoutGlobalScope('effective_backup_period')->create([
            'leader_id' => $leader->username,
            'subordinate_id' => $subordinate->username,
            'status' => $status,
            'relation_type' => $relationType,
        ]);
    }
}
