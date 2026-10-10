<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DivisionMigrationTest extends TestCase
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

        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->json('permissions')->nullable();
        });
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('job_level_id')->nullable();
        });

        DB::table('roles')->insert([
            'name' => 'admin',
            'permissions' => json_encode(['users_locations', 'job_levels']),
        ]);
    }

    protected function tearDown(): void
    {
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_migration_seeds_hierarchy_and_assigns_admin_permission(): void
    {
        $migration = require database_path('migrations/2026_10_09_000004_create_divisions_and_assign_users.php');
        $migration->up();

        $this->assertTrue(Schema::hasColumn('users', 'division_id'));
        $this->assertSame(11, DB::table('divisions')->count());

        $supermarketId = DB::table('divisions')->where('code', 'SPM')->value('id');
        $this->assertSame($supermarketId, DB::table('divisions')->where('code', 'FOOD-SPM')->value('parent_id'));
        $this->assertSame('FSH', DB::table('divisions')->where('code', 'MENS-FSH')->value('group_code'));
        $this->assertNull(DB::table('divisions')->where('code', 'YOEL')->value('parent_id'));

        $permissions = json_decode(DB::table('roles')->where('name', 'admin')->value('permissions'), true);
        $this->assertContains('divisions', $permissions);
    }
}
