<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Task;
use App\Models\User;
use App\Services\ScoringService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DailyScoreDisplayTest extends TestCase
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
            $table->dateTime('due_at');
            $table->string('status')->default('pending');
            $table->dateTime('revision_deadline_at')->nullable();
            $table->timestamps();
        });
        Schema::create('task_evidences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->string('type');
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_working_day_without_tasks_is_an_available_zero(): void
    {
        $crew = new User(['username' => 'crew-1']);
        Attendance::create(['user_id' => 'crew-1', 'date' => '2026-10-09', 'status_code' => 'H']);

        $result = (new ScoringService())->getCrewDailyScoreDisplay($crew, Carbon::parse('2026-10-09'));

        $this->assertTrue($result['available']);
        $this->assertSame(0, $result['score']);
        $this->assertSame('2026-10-09', $result['score_date']);
        $this->assertSame('H', $result['availability_mode']);
    }

    public function test_non_working_day_is_not_presented_as_zero(): void
    {
        $crew = new User(['username' => 'crew-1']);
        Attendance::create(['user_id' => 'crew-1', 'date' => '2026-10-09', 'status_code' => 'O']);

        $result = (new ScoringService())->getCrewDailyScoreDisplay($crew, Carbon::parse('2026-10-09'));

        $this->assertFalse($result['available']);
        $this->assertNull($result['score']);
        $this->assertSame('non_working_day', $result['unavailable_reason']);
    }

    public function test_missing_attendance_is_not_presented_as_zero(): void
    {
        $crew = new User(['username' => 'crew-1']);

        $result = (new ScoringService())->getCrewDailyScoreDisplay($crew, Carbon::parse('2026-10-09'));

        $this->assertFalse($result['available']);
        $this->assertNull($result['score']);
        $this->assertSame('attendance_missing', $result['unavailable_reason']);
    }

    public function test_existing_task_remains_visible_when_attendance_has_not_synced(): void
    {
        $crew = new User(['username' => 'crew-1']);
        Task::create([
            'employee_id' => 'crew-1',
            'due_at' => '2026-10-09 18:00:00',
            'status' => 'pending',
        ]);

        $result = (new ScoringService())->getCrewDailyScoreDisplay($crew, Carbon::parse('2026-10-09'));

        $this->assertTrue($result['available']);
        $this->assertSame(0, $result['score']);
        $this->assertNull($result['unavailable_reason']);
    }

    public function test_cashier_placeholder_uses_previous_date_without_fake_score(): void
    {
        $crew = new User(['username' => 'cashier-1']);

        $result = (new ScoringService())->getCrewDailyScoreDisplay($crew, Carbon::parse('2026-10-09'), 'cashier');

        $this->assertSame('cashier', $result['category']);
        $this->assertSame('2026-10-08', $result['score_date']);
        $this->assertSame('H+1', $result['availability_mode']);
        $this->assertFalse($result['available']);
        $this->assertNull($result['score']);
        $this->assertSame('cashier_integration_pending', $result['unavailable_reason']);
    }
}
