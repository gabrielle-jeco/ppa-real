<?php

namespace App\Providers;

use App\Cache\PostgresDatabaseStore;
use Illuminate\Cache\DatabaseStore;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     */
    public function register()
    {
        //
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot()
    {
        Cache::extend('database', function ($app, $config) {
            $connection = $app['db']->connection($config['connection'] ?? null);
            $storeClass = $connection->getDriverName() === 'pgsql'
                ? PostgresDatabaseStore::class : DatabaseStore::class;
            $store = new $storeClass(
                $connection,
                $config['table'],
                $config['prefix'] ?? $app['config']['cache.prefix'],
                $config['lock_table'] ?? 'cache_locks',
                $config['lock_lottery'] ?? [2, 100]
            );

            return Cache::repository($store->setLockConnection(
                $app['db']->connection($config['lock_connection'] ?? $config['connection'] ?? null)
            ));
        });
    }
}
