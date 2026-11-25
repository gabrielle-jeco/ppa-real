<?php

namespace Tests\Feature;

use App\Cache\PostgresDatabaseStore;
use Carbon\Carbon;
use Illuminate\Cache\DatabaseStore;
use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\Repository;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class PostgresDatabaseStoreTest extends TestCase
{
    private PostgresDatabaseStore $store;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-25 08:00:00'));
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');
        Schema::create('cache', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->text('value');
            $table->integer('expiration');
        });
        $this->store = new PostgresDatabaseStore(DB::connection(), 'cache', 'test:');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_put_replaces_existing_value_and_expiration_without_duplicate_rows(): void
    {
        $this->assertTrue($this->store->put('payload', ['old' => true], 60));
        Carbon::setTestNow(now()->addSeconds(10));
        $this->assertTrue($this->store->put('payload', ['text' => "new\0value"], 120));

        $this->assertSame(['text' => "new\0value"], $this->store->get('payload'));
        $this->assertSame(1, DB::table('cache')->count());
        $this->assertSame(now()->timestamp + 120, DB::table('cache')->value('expiration'));
        $this->assertSame('test:payload', DB::table('cache')->value('key'));
    }

    public function test_add_preserves_live_value_and_timer_then_replaces_expired_entry(): void
    {
        $this->assertTrue($this->store->add('timer', 10, 60));
        $expiration = DB::table('cache')->value('expiration');
        Carbon::setTestNow(now()->addSeconds(10));
        $this->assertFalse($this->store->add('timer', 99, 120));
        $this->assertSame(10, $this->store->get('timer'));
        $this->assertSame($expiration, DB::table('cache')->value('expiration'));

        Carbon::setTestNow(Carbon::createFromTimestamp($expiration));
        $this->assertTrue($this->store->add('timer', 99, 120));
        $this->assertSame(99, $this->store->get('timer'));
        $this->assertSame(1, DB::table('cache')->count());
        Carbon::setTestNow(now()->addSeconds(120));
        $this->assertNull($this->store->get('timer'));
    }

    public function test_rate_limiter_keeps_threshold_and_original_decay_window(): void
    {
        $limiter = new RateLimiter(new Repository($this->store));
        for ($i = 1; $i <= 10; $i++) {
            $this->assertSame($i, $limiter->hit('login', 60));
        }
        $this->assertTrue($limiter->tooManyAttempts('login', 10));
        Carbon::setTestNow(now()->addSeconds(30));
        $this->assertSame(30, $limiter->availableIn('login'));
        Carbon::setTestNow(now()->addSeconds(30));
        $this->assertFalse($limiter->tooManyAttempts('login', 10));
        $this->assertSame(1, $limiter->hit('login', 60));
    }

    public function test_database_driver_uses_custom_store_only_for_postgresql(): void
    {
        config(['cache.stores.pg_cache' => ['driver' => 'database', 'connection' => 'pgsql', 'table' => 'cache', 'prefix' => 'pg:']]);
        $this->assertInstanceOf(PostgresDatabaseStore::class, Cache::store('pg_cache')->getStore());
        $this->assertSame('pg:', Cache::store('pg_cache')->getStore()->getPrefix());
        $this->assertSame(DatabaseStore::class, get_class(Cache::store('database')->getStore()));
    }

    public function test_postgresql_writes_handle_conflicts_in_sql(): void
    {
        $connection = DB::connection('pgsql');
        $store = new PostgresDatabaseStore($connection, 'cache', 'pg:');
        $queries = $connection->pretend(function () use ($store) {
            $store->put('key', 'value', 60);
            $store->add('key', 'replacement', 60);
        });

        $this->assertCount(3, $queries);
        $this->assertStringContainsString('on conflict ("key") do update', $queries[0]['query']);
        $this->assertStringContainsString('on conflict do nothing', $queries[1]['query']);
        $this->assertStringContainsString('"expiration" <= ?', $queries[2]['query']);
    }
}
