<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        if (!Schema::hasTable('roles')) {
            Schema::create('roles', function (Blueprint $table) {
                $table->id();
                $table->string('name')->unique();
                $table->timestamps();
            });
        }

        $now = now();
        foreach (['admin', 'user'] as $role) {
            DB::table('roles')->updateOrInsert(
                ['name' => $role],
                ['updated_at' => $now, 'created_at' => $now]
            );
        }

        if (!Schema::hasColumn('users', 'role_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->foreignId('role_id')->nullable()->after('job_level_id')->constrained('roles')->nullOnDelete();
            });
        }

        $adminRoleId = DB::table('roles')->where('name', 'admin')->value('id');
        $userRoleId = DB::table('roles')->where('name', 'user')->value('id');

        DB::table('users')
            ->leftJoin('job_levels', 'job_levels.id', '=', 'users.job_level_id')
            ->whereNull('users.role_id')
            ->update([
                'role_id' => DB::raw("CASE WHEN LOWER(TRIM(job_levels.name)) = 'superadmin' THEN {$adminRoleId} ELSE {$userRoleId} END"),
            ]);
    }

    public function down()
    {
        if (Schema::hasColumn('users', 'role_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropConstrainedForeignId('role_id');
            });
        }

        Schema::dropIfExists('roles');
    }
};
