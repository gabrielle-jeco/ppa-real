<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_presence', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('device_key', 64)->default('default');
            $table->timestamp('last_seen_at')->nullable();
            $table->string('last_url', 1000)->nullable();
            $table->string('device_type', 50)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'device_key']);
            $table->index('last_seen_at');
            $table->index('user_id');
        });

        Schema::create('user_login_events', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('role_type', 100)->nullable();
            $table->string('account_role', 100)->nullable();
            $table->string('login_source', 100)->nullable();
            $table->timestamp('login_at')->useCurrent();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();

            $table->index(['login_at', 'user_id']);
            $table->index('user_id');
        });

        $permissions = [
            'users_locations',
            'job_levels',
            'app_roles',
            'reporting_lines',
            'work_stations',
            'locations',
            'regionals',
            'evaluation_masters',
            'role_management',
            'user_activity',
        ];

        DB::table('roles')
            ->whereRaw('LOWER(TRIM(name)) = ?', ['admin'])
            ->update(['permissions' => json_encode($permissions)]);
    }

    public function down(): void
    {
        Schema::dropIfExists('user_login_events');
        Schema::dropIfExists('user_presence');
    }
};
