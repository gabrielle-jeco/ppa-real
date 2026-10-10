<?php

namespace Tests\Feature;

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
            ->assertJsonPath('evaluation_window_ends_at', '2026-09-06');
    }

    public function test_personality_evaluation_only_accepts_previous_month(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-03 10:00:00', 'Asia/Jakarta'));
        [$supervisor, $crew] = $this->supervisorAndCrew();
        $payload = [
            'user_id' => $crew->username,
            'scores' => ['teamwork' => 5],
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
