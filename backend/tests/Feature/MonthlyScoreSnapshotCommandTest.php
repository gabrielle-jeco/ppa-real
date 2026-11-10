<?php

namespace Tests\Feature;

use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MonthlyScoreSnapshotCommandTest extends TestCase
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
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_previous_month_option_handles_the_year_boundary(): void
    {
        Carbon::setTestNow(Carbon::parse('2027-01-01 02:00:00', 'Asia/Jakarta'));

        $this->artisan('score:snapshot', ['--previous-month' => true])
            ->expectsOutput('Taking score snapshot for December 2026...')
            ->expectsOutput('Snapshot completed! Processed 0 Crews and 0 Supervisors.')
            ->assertSuccessful();
    }
}
