<?php

namespace Tests\Feature;

use App\Models\EvaluationReopenRequest;
use App\Models\MonthlyPersonalityEvaluation;
use App\Models\ReportingLine;
use App\Models\User;
use App\Models\UserLocation;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class EvaluationWindowTest extends TestCase
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
            $table->boolean('active')->default(true);
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
            $table->string('subordinate_id');
            $table->string('leader_id');
            $table->string('status')->default('active');
            $table->string('relation_type')->default('permanent');
            $table->unsignedBigInteger('backup_request_id')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_until')->nullable();
            $table->timestamps();
        });
        $this->createBackupTables();
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
        Schema::create('evaluation_reopen_requests', function (Blueprint $table) {
            $table->id();
            $table->string('requester_id');
            $table->string('evaluatee_id');
            $table->date('evaluation_period');
            $table->string('evaluation_type')->default('personality');
            $table->unsignedTinyInteger('attempt');
            $table->string('status')->default('pending');
            $table->text('reason')->nullable();
            $table->string('reviewed_by')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['requester_id', 'evaluatee_id', 'evaluation_period', 'evaluation_type', 'attempt']);
        });
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    /**
     * @dataProvider openPersonalityWindowProvider
     */
    public function test_personality_evaluation_targets_previous_month_on_days_one_through_six(
        string $now,
        string $expectedPeriod
    ): void {
        Carbon::setTestNow(Carbon::parse($now, 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        $this->actingAs($supervisor, 'sanctum')
            ->getJson('/api/evaluations/check/' . $crew->username)
            ->assertOk()
            ->assertJsonPath('can_evaluate', true)
            ->assertJsonPath('is_locked', false)
            ->assertJsonPath('evaluation_period', $expectedPeriod)
            ->assertJsonPath('target_period', $expectedPeriod);
    }

    public function openPersonalityWindowProvider(): array
    {
        return [
            'first day' => ['2026-09-01 10:00:00', '2026-08-01'],
            'sixth day' => ['2026-09-06 23:59:59', '2026-08-01'],
            'year boundary' => ['2027-01-01 10:00:00', '2026-12-01'],
            'leap February' => ['2028-03-01 10:00:00', '2028-02-01'],
        ];
    }

    public function test_personality_evaluation_is_locked_from_day_seven(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-07 00:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        $this->actingAs($supervisor, 'sanctum')
            ->getJson('/api/evaluations/check/' . $crew->username)
            ->assertOk()
            ->assertJsonPath('can_evaluate', false)
            ->assertJsonPath('is_locked', true)
            ->assertJsonPath('evaluation_period', '2026-08-01')
            ->assertJsonPath('evaluation_window_starts_at', '2026-09-01')
            ->assertJsonPath('evaluation_window_ends_at', '2026-09-06')
            ->assertJsonPath('can_request_reopen', true)
            ->assertJsonPath('reopen_attempts_remaining', 3);
    }

    public function test_manager_can_approve_reopen_request_for_twenty_four_hours_and_completion_closes_it(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-07 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();
        $manager = $this->createUser('manager-1', 'manager');
        $this->createReportingLine($manager, $supervisor);

        $requestId = $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations/reopen-requests/' . $crew->username, ['reason' => 'Operasional toko'])
            ->assertCreated()
            ->assertJsonPath('request.status', 'pending')
            ->assertJsonPath('request.attempt', 1)
            ->json('request.id');

        $this->actingAs($manager, 'sanctum')
            ->patchJson('/api/manager/evaluation-reopen-requests/' . $requestId . '/review', ['decision' => 'approved'])
            ->assertOk()
            ->assertJsonPath('request.status', 'approved');

        $this->actingAs($supervisor, 'sanctum')
            ->getJson('/api/evaluations/check/' . $crew->username)
            ->assertOk()
            ->assertJsonPath('can_evaluate', true)
            ->assertJsonPath('reopen_request.status', 'approved');

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['self_development' => 5, 'teamwork' => 5],
                'total_score' => 100,
                'date' => '2026-08-01',
            ])
            ->assertOk();

        $this->assertDatabaseHas('evaluation_reopen_requests', ['id' => $requestId, 'status' => 'completed']);
        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations/reopen-requests/' . $crew->username)
            ->assertStatus(422);
    }

    public function test_rejected_requests_count_toward_three_attempt_limit_and_rejection_reason_is_required(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-07 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();
        $manager = $this->createUser('manager-1', 'manager');
        $this->createReportingLine($manager, $supervisor);

        for ($attempt = 1; $attempt <= 3; $attempt++) {
            $requestId = $this->actingAs($supervisor, 'sanctum')
                ->postJson('/api/evaluations/reopen-requests/' . $crew->username)
                ->assertCreated()
                ->assertJsonPath('request.attempt', $attempt)
                ->json('request.id');

            if ($attempt === 1) {
                $this->actingAs($manager, 'sanctum')
                    ->patchJson('/api/manager/evaluation-reopen-requests/' . $requestId . '/review', ['decision' => 'rejected'])
                    ->assertStatus(422);
            }

            $this->actingAs($manager, 'sanctum')
                ->patchJson('/api/manager/evaluation-reopen-requests/' . $requestId . '/review', [
                    'decision' => 'rejected',
                    'rejection_reason' => 'Data belum lengkap',
                ])
                ->assertOk();
        }

        $this->actingAs($supervisor, 'sanctum')
            ->getJson('/api/evaluations/check/' . $crew->username)
            ->assertOk()
            ->assertJsonPath('can_request_reopen', false)
            ->assertJsonPath('reopen_attempts_used', 3)
            ->assertJsonPath('reopen_attempts_remaining', 0);

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations/reopen-requests/' . $crew->username)
            ->assertStatus(422);
    }

    public function test_manager_request_list_supports_tabs_search_and_pagination(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-07 10:00:00', 'Asia/Jakarta'));
        $manager = $this->createUser('manager-1', 'manager');
        $supervisor = $this->createUser('supervisor-1', 'supervisor');
        $crewAlpha = $this->createUser('crew-alpha', 'sc');
        $crewBeta = $this->createUser('crew-beta', 'sc');
        $this->createReportingLine($manager, $supervisor);

        EvaluationReopenRequest::create([
            'requester_id' => $supervisor->username,
            'evaluatee_id' => $crewAlpha->username,
            'evaluation_period' => '2026-08-01',
            'evaluation_type' => 'personality',
            'attempt' => 1,
            'status' => 'pending',
        ]);
        EvaluationReopenRequest::create([
            'requester_id' => $supervisor->username,
            'evaluatee_id' => $crewAlpha->username,
            'evaluation_period' => '2026-08-01',
            'evaluation_type' => 'personality',
            'attempt' => 2,
            'status' => 'rejected',
        ]);
        EvaluationReopenRequest::create([
            'requester_id' => $supervisor->username,
            'evaluatee_id' => $crewBeta->username,
            'evaluation_period' => '2026-08-01',
            'evaluation_type' => 'personality',
            'attempt' => 1,
            'status' => 'completed',
        ]);

        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/manager/evaluation-reopen-requests?tab=pending&per_page=1')
            ->assertOk()
            ->assertJsonPath('pending_count', 1)
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('requests.0.status', 'pending');

        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/manager/evaluation-reopen-requests?tab=history&search=crew-beta&per_page=1')
            ->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('requests.0.evaluatee.id', 'crew-beta')
            ->assertJsonPath('requests.0.status', 'completed');

        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/manager/evaluation-reopen-requests?tab=history&per_page=1&page=2')
            ->assertOk()
            ->assertJsonPath('pagination.current_page', 2)
            ->assertJsonPath('pagination.last_page', 2)
            ->assertJsonPath('pagination.total', 2)
            ->assertJsonCount(1, 'requests');
    }

    public function test_review_marks_pending_request_completed_when_evaluation_already_exists(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-07 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();
        $manager = $this->createUser('manager-1', 'manager');
        $this->createReportingLine($manager, $supervisor);

        $requestId = $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations/reopen-requests/' . $crew->username)
            ->assertCreated()
            ->json('request.id');

        MonthlyPersonalityEvaluation::create([
            'evaluatee_id' => $crew->username,
            'evaluator_id' => $supervisor->username,
            'evaluation_period' => '2026-08-01',
            'evaluation_type' => 'personality',
            'score' => 80,
            'scores' => ['teamwork' => 4],
        ]);

        $this->actingAs($manager, 'sanctum')
            ->patchJson('/api/manager/evaluation-reopen-requests/' . $requestId . '/review', ['decision' => 'approved'])
            ->assertStatus(422);

        $this->assertDatabaseHas('evaluation_reopen_requests', [
            'id' => $requestId,
            'status' => 'completed',
        ]);
        $this->assertNotNull(EvaluationReopenRequest::findOrFail($requestId)->completed_at);
    }

    public function test_personality_evaluation_only_accepts_previous_month(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();
        $payload = [
            'user_id' => $crew->username,
            'scores' => ['self_development' => 5, 'teamwork' => 5],
            'total_score' => 100,
        ];

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', $payload + ['date' => '2026-09-01'])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Evaluasi hanya bisa diisi untuk bulan sebelumnya.');

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', $payload + ['date' => '2026-08-01'])
            ->assertOk()
            ->assertJsonPath('evaluation_type', 'personality');

        $evaluation = MonthlyPersonalityEvaluation::firstOrFail();
        $this->assertSame('2026-08-01', $evaluation->evaluation_period->toDateString());
        $this->assertSame('personality', $evaluation->evaluation_type);
    }

    public function test_completed_personality_evaluation_remains_viewable_after_window_closes(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-07 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();
        MonthlyPersonalityEvaluation::create([
            'evaluatee_id' => $crew->username,
            'evaluator_id' => $supervisor->username,
            'evaluation_period' => '2026-08-01',
            'evaluation_type' => 'personality',
            'score' => 80,
            'scores' => ['teamwork' => 4],
        ]);

        $this->actingAs($supervisor, 'sanctum')
            ->getJson('/api/evaluations/check/' . $crew->username)
            ->assertOk()
            ->assertJsonPath('evaluated', true)
            ->assertJsonPath('can_evaluate', false)
            ->assertJsonPath('data.total_score', 80);
    }

    public function test_manager_review_keeps_current_month_and_last_seven_day_window(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-23 10:00:00', 'Asia/Jakarta'));
        [$manager, $supervisor] = $this->managerAndSupervisor();

        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/evaluations/check/' . $supervisor->username)
            ->assertOk()
            ->assertJsonPath('evaluation_type', 'manager_review')
            ->assertJsonPath('evaluation_period', '2026-09-01')
            ->assertJsonPath('evaluation_window_starts_at', '2026-09-24')
            ->assertJsonPath('can_evaluate', false);

        Carbon::setTestNow(Carbon::parse('2026-09-24 00:00:00', 'Asia/Jakarta'));

        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/evaluations/check/' . $supervisor->username)
            ->assertOk()
            ->assertJsonPath('can_evaluate', true);
    }

    public function test_store_ignores_tampered_total_score_and_computes_server_side(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['self_development' => 1, 'teamwork' => 2],
                'total_score' => 100,
                'date' => '2026-08-01',
            ])
            ->assertOk()
            ->assertJsonPath('total_score', 30);

        $evaluation = MonthlyPersonalityEvaluation::firstOrFail();
        $this->assertSame(30.0, (float) $evaluation->score);
        $this->assertSame(['self_development' => 1, 'teamwork' => 2], $evaluation->scores);
    }

    public function test_store_rejects_out_of_range_or_non_integer_individual_scores(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        foreach ([0, 6, 3.5] as $invalidScore) {
            $this->actingAs($supervisor, 'sanctum')
                ->postJson('/api/evaluations', [
                    'user_id' => $crew->username,
                    'scores' => ['self_development' => $invalidScore, 'teamwork' => 4],
                    'total_score' => 80,
                    'date' => '2026-08-01',
                ])
                ->assertStatus(422)
                ->assertJsonValidationErrors('scores.self_development');
        }

        $this->assertDatabaseCount('monthly_personality_evaluations', 0);
    }

    public function test_store_rejects_missing_or_unexpected_criteria_in_fallback_mode(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['teamwork' => 5],
                'total_score' => 100,
                'date' => '2026-08-01',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('scores');

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['self_development' => 5, 'teamwork' => 5, 'extra_key' => 5],
                'total_score' => 100,
                'date' => '2026-08-01',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('scores');
    }

    public function test_store_enforces_active_evaluation_masters_when_seeded(): void
    {
        Schema::create('evaluation_masters', function (Blueprint $table) {
            $table->id();
            $table->string('title')->default('MONTHLY EVALUATION');
            $table->string('subtitle')->default('SIKAP KEPRIBADIAN');
            $table->string('question');
            $table->json('answers');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        DB::table('evaluation_masters')->insert([
            [
                'id' => 10,
                'question' => 'Disiplin',
                'answers' => json_encode(['1', '2', '3', '4', '5']),
                'sort_order' => 1,
                'active' => true,
            ],
            [
                'id' => 11,
                'question' => 'Kerjasama',
                'answers' => json_encode(['1', '2', '3', '4', '5']),
                'sort_order' => 2,
                'active' => true,
            ],
            [
                'id' => 12,
                'question' => 'Nonaktif',
                'answers' => json_encode(['1', '2', '3', '4', '5']),
                'sort_order' => 3,
                'active' => false,
            ],
        ]);

        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['self_development' => 5, 'teamwork' => 5],
                'date' => '2026-08-01',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('scores');

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['evaluation_10' => 4, 'evaluation_11' => 5],
                'total_score' => 10,
                'date' => '2026-08-01',
            ])
            ->assertOk()
            ->assertJsonPath('total_score', 90);

        $this->assertSame(90.0, (float) MonthlyPersonalityEvaluation::firstOrFail()->score);
    }

    public function test_manager_review_enforces_manager_criteria_and_computes_server_side(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-25 10:00:00', 'Asia/Jakarta'));
        [$manager, $supervisor] = $this->managerAndSupervisor();

        $this->actingAs($manager, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $supervisor->username,
                'scores' => ['direction_execution' => 5],
                'date' => '2026-09-01',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('scores');

        $this->actingAs($manager, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $supervisor->username,
                'scores' => [
                    'direction_execution' => 4,
                    'crew_follow_up' => 3,
                    'assignment_quality' => 3,
                ],
                'total_score' => 100,
                'date' => '2026-09-01',
            ])
            ->assertOk()
            ->assertJsonPath('evaluation_type', 'manager_review')
            ->assertJsonPath('total_score', 66.67);

        $this->assertSame(66.67, (float) MonthlyPersonalityEvaluation::firstOrFail()->score);
    }

    public function test_reopen_request_notifies_both_co_and_sm_in_sm_co_supervisor_chain(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-07 10:00:00', 'Asia/Jakarta'));

        Schema::create('job_levels', function (Blueprint $table) {
            $table->id();
            $table->string('position_code')->nullable();
            $table->string('name');
            $table->string('grade')->nullable();
        });
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('job_level_id')->nullable();
        });

        $coLevelId = DB::table('job_levels')->insertGetId([
            'position_code' => 'CF-OPR-CAB-01',
            'name' => 'CHIEF OPERATION',
            'grade' => 'CO',
        ]);
        $smLevelId = DB::table('job_levels')->insertGetId([
            'position_code' => 'SM-01',
            'name' => 'STORE MANAGER',
            'grade' => 'SM',
        ]);

        $sm = $this->createUser('sm-1', 'manager');
        $sm->forceFill(['job_level_id' => $smLevelId])->save();

        $co = $this->createUser('co-1', 'manager');
        $co->forceFill(['job_level_id' => $coLevelId])->save();

        $supervisor = $this->createUser('supervisor-1', 'supervisor');
        $crew = $this->createUser('crew-1', 'sc');

        $this->createReportingLine($sm, $co);
        $this->createReportingLine($co, $supervisor);
        $this->createReportingLine($supervisor, $crew);

        $notifiedManagers = [];
        $this->mock(\App\Services\UserNotificationService::class, function ($mock) use (&$notifiedManagers) {
            $mock->shouldReceive('createAndPush')
                ->twice()
                ->withArgs(function ($recipientId, $type) use (&$notifiedManagers) {
                    if ($type === 'evaluation_reopen_requested') {
                        $notifiedManagers[] = $recipientId;
                    }
                    return $type === 'evaluation_reopen_requested';
                })
                ->andReturnNull();
        });

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations/reopen-requests/' . $crew->username, ['reason' => 'Tutup shift'])
            ->assertCreated();

        sort($notifiedManagers);
        $this->assertSame(['co-1', 'sm-1'], $notifiedManagers);
    }

    public function test_store_returns_409_conflict_on_unique_constraint_violation_23505(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        MonthlyPersonalityEvaluation::creating(function () {
            $pdoException = new \PDOException('SQLSTATE[23505]: Unique violation', 23505);
            $pdoException->errorInfo = [
                '23505',
                7,
                'ERROR: duplicate key value violates unique constraint "mpe_unique_eval_period_type_idx"',
            ];

            throw new \Illuminate\Database\QueryException(
                'insert into "monthly_personality_evaluations"',
                [],
                $pdoException
            );
        });

        try {
            $this->actingAs($supervisor, 'sanctum')
                ->postJson('/api/evaluations', [
                    'user_id' => $crew->username,
                    'scores' => ['self_development' => 4, 'teamwork' => 5],
                    'date' => '2026-08-01',
                ])
                ->assertStatus(409)
                ->assertJsonPath(
                    'error',
                    'Evaluasi untuk karyawan dan periode ini baru saja disimpan. Muat ulang halaman untuk melihat data terbaru.'
                )
                ->assertJsonPath(
                    'message',
                    'Evaluasi untuk karyawan dan periode ini baru saja disimpan. Muat ulang halaman untuk melihat data terbaru.'
                );
        } finally {
            MonthlyPersonalityEvaluation::flushEventListeners();
        }

        $this->assertDatabaseCount('monthly_personality_evaluations', 0);
    }

    public function test_store_does_not_mask_unrelated_23505_error_as_409(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        MonthlyPersonalityEvaluation::creating(function () {
            $pdoException = new \PDOException('SQLSTATE[23505]: Unique violation', 23505);
            $pdoException->errorInfo = [
                '23505',
                7,
                'ERROR: duplicate key value violates unique constraint "evaluation_reopen_requests_pkey"',
            ];

            throw new \Illuminate\Database\QueryException(
                'insert into "monthly_personality_evaluations"',
                [],
                $pdoException
            );
        });

        try {
            $this->actingAs($supervisor, 'sanctum')
                ->postJson('/api/evaluations', [
                    'user_id' => $crew->username,
                    'scores' => ['self_development' => 4, 'teamwork' => 5],
                    'date' => '2026-08-01',
                ])
                ->assertStatus(500);
        } finally {
            MonthlyPersonalityEvaluation::flushEventListeners();
        }
    }

    public function test_concurrent_new_evaluation_race_hits_unique_constraint_and_returns_409(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        Schema::table('monthly_personality_evaluations', function (Blueprint $table) {
            $table->unique(
                ['evaluatee_id', 'evaluator_id', 'evaluation_period', 'evaluation_type'],
                'mpe_unique_eval_period_type_idx'
            );
        });

        $raced = false;
        MonthlyPersonalityEvaluation::creating(function () use (&$raced, $crew, $supervisor) {
            if ($raced) {
                return;
            }
            $raced = true;

            // Runs after SELECT ... FOR UPDATE found no existing row, right before request B's INSERT.
            DB::table('monthly_personality_evaluations')->insert([
                'evaluatee_id' => $crew->username,
                'evaluator_id' => $supervisor->username,
                'evaluation_period' => '2026-08-01 00:00:00',
                'evaluation_type' => 'personality',
                'score' => 80,
                'scores' => json_encode(['self_development' => 4, 'teamwork' => 4]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        try {
            $this->actingAs($supervisor, 'sanctum')
                ->postJson('/api/evaluations', [
                    'user_id' => $crew->username,
                    'scores' => ['self_development' => 5, 'teamwork' => 5],
                    'date' => '2026-08-01',
                ])
                ->assertStatus(409)
                ->assertJsonPath(
                    'error',
                    'Evaluasi untuk karyawan dan periode ini baru saja disimpan. Muat ulang halaman untuk melihat data terbaru.'
                );
        } finally {
            MonthlyPersonalityEvaluation::flushEventListeners();
        }

        $this->assertLessThanOrEqual(1, MonthlyPersonalityEvaluation::count());
    }

    public function test_regular_and_reopened_personality_evaluations_refresh_crew_monthly_snapshot(): void
    {
        $this->createSnapshotDependencyTables();

        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        DB::table('monthly_overall_scores')->insert([
            [
                'user_id' => $crew->username,
                'period' => '2026-08-01',
                'final_score' => 0,
                'details' => json_encode(['personality_score' => 0]),
            ],
            [
                'user_id' => $crew->username,
                'period' => '2026-07-01',
                'final_score' => 88,
                'details' => json_encode(['personality_score' => 90]),
            ],
        ]);

        // Regular window (day 3) saves 100 personality -> refreshes August 2026 snapshot (0 -> 15) without touching July 2026.
        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['self_development' => 5, 'teamwork' => 5],
                'date' => '2026-08-01',
            ])
            ->assertOk();

        $augRow = DB::table('monthly_overall_scores')
            ->where('user_id', $crew->username)
            ->whereDate('period', '2026-08-01')
            ->first();
        $this->assertNotNull($augRow);
        $this->assertSame(15, (int) $augRow->final_score);
        $this->assertSame(100, (int) (json_decode($augRow->details, true)['personality_score'] ?? 0));
        $this->assertSame(
            1,
            DB::table('monthly_overall_scores')
                ->where('user_id', $crew->username)
                ->whereDate('period', '2026-08-01')
                ->count()
        );

        // Unrelated historical period remains untouched
        $this->assertSame(
            88,
            (int) DB::table('monthly_overall_scores')
                ->where('user_id', $crew->username)
                ->whereDate('period', '2026-07-01')
                ->value('final_score')
        );

        // Reopen scenario on September 10 for another crew member
        Carbon::setTestNow(Carbon::parse('2026-09-10 10:00:00', 'Asia/Jakarta'));
        $crew2 = $this->createUser('crew-2', 'sc');
        $this->createReportingLine($supervisor, $crew2);
        $manager = $this->createUser('manager-1', 'manager');
        $this->createReportingLine($manager, $supervisor);

        $requestId = $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations/reopen-requests/' . $crew2->username, ['reason' => 'Terlewat'])
            ->assertCreated()
            ->json('request.id');

        $this->actingAs($manager, 'sanctum')
            ->patchJson('/api/manager/evaluation-reopen-requests/' . $requestId . '/review', ['decision' => 'approved'])
            ->assertOk();

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew2->username,
                'scores' => ['self_development' => 4, 'teamwork' => 4],
                'date' => '2026-08-01',
            ])
            ->assertOk();

        $crew2Aug = DB::table('monthly_overall_scores')
            ->where('user_id', $crew2->username)
            ->whereDate('period', '2026-08-01')
            ->first();
        $this->assertNotNull($crew2Aug);
        $this->assertSame(12, (int) $crew2Aug->final_score);
        $this->assertSame(80, (int) (json_decode($crew2Aug->details, true)['personality_score'] ?? 0));
    }

    public function test_post_commit_snapshot_refresh_failure_does_not_fail_evaluation_save(): void
    {
        Schema::create('monthly_overall_scores', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('period');
            $table->integer('final_score');
            $table->json('details')->nullable();
            $table->timestamps();
        });

        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        $scoringMock = \Mockery::mock(\App\Services\ScoringService::class);
        $scoringMock->shouldReceive('refreshCrewMonthlySnapshot')
            ->once()
            ->andThrow(new \RuntimeException('Simulated snapshot refresh error'));
        $this->app->instance(\App\Services\ScoringService::class, $scoringMock);

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['self_development' => 5, 'teamwork' => 5],
                'date' => '2026-08-01',
            ])
            ->assertOk()
            ->assertJsonPath('total_score', 100);

        $this->assertDatabaseHas('monthly_personality_evaluations', [
            'evaluatee_id' => $crew->username,
            'evaluator_id' => $supervisor->username,
            'evaluation_type' => 'personality',
            'score' => 100.0,
        ]);
    }

    private function createSnapshotDependencyTables(): void
    {
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
            $table->string('employer_id')->nullable();
            $table->dateTime('due_at');
            $table->string('status')->default('pending');
            $table->dateTime('revision_deadline_at')->nullable();
            $table->timestamps();
        });
        Schema::create('task_evidences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->string('type');
            $table->unsignedTinyInteger('attempt_no')->nullable();
            $table->string('review_status')->nullable();
            $table->decimal('awarded_score', 5, 2)->nullable();
            $table->timestamps();
        });
        Schema::create('guide_reads', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->unsignedBigInteger('work_station_id')->nullable();
            $table->date('read_date');
        });
        Schema::create('monthly_overall_scores', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('period');
            $table->integer('final_score');
            $table->json('details')->nullable();
            $table->timestamps();
        });
    }

    public function test_store_enforces_unique_constraint_and_updates_idempotently(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();

        Schema::table('monthly_personality_evaluations', function (Blueprint $table) {
            $table->unique(
                ['evaluatee_id', 'evaluator_id', 'evaluation_period', 'evaluation_type'],
                'mpe_unique_eval_period_type_idx'
            );
        });

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['self_development' => 3, 'teamwork' => 3],
                'date' => '2026-08-01',
            ])
            ->assertOk()
            ->assertJsonPath('total_score', 60);

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/evaluations', [
                'user_id' => $crew->username,
                'scores' => ['self_development' => 5, 'teamwork' => 5],
                'date' => '2026-08-01',
            ])
            ->assertOk()
            ->assertJsonPath('total_score', 100);

        $this->assertDatabaseCount('monthly_personality_evaluations', 1);
        $this->assertSame(100.0, (float) MonthlyPersonalityEvaluation::firstOrFail()->score);

        $this->expectException(\Illuminate\Database\QueryException::class);
        MonthlyPersonalityEvaluation::create([
            'evaluatee_id' => $crew->username,
            'evaluator_id' => $supervisor->username,
            'evaluation_period' => '2026-08-01',
            'evaluation_type' => 'personality',
            'score' => 50,
        ]);
    }

    private function supervisorAndCrew(): array
    {
        $supervisor = $this->createUser('supervisor-1', 'supervisor');
        $crew = $this->createUser('crew-1', 'sc');
        $this->createReportingLine($supervisor, $crew);

        return [$supervisor, $crew];
    }

    private function managerAndSupervisor(): array
    {
        $manager = $this->createUser('manager-1', 'manager');
        $supervisor = $this->createUser('supervisor-1', 'supervisor');
        $this->createReportingLine($manager, $supervisor);

        return [$manager, $supervisor];
    }

    private function createUser(string $username, string $jobLevel): User
    {
        $user = User::create([
            'name' => $username,
            'username' => $username,
            'password' => 'password',
        ]);
        UserLocation::create([
            'user_id' => $username,
            'location_id' => 'YTH',
            'job_level' => $jobLevel,
        ]);
        $user->setRelation('accountRole', null);
        $user->load('userLocations');

        return $user;
    }

    private function createReportingLine(User $leader, User $subordinate): void
    {
        ReportingLine::create([
            'leader_id' => $leader->username,
            'subordinate_id' => $subordinate->username,
            'status' => 'active',
            'relation_type' => 'permanent',
        ]);
    }
}
