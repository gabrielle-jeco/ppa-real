<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        Schema::table('roles', function (Blueprint $table) {
            if (!Schema::hasColumn('roles', 'description')) {
                $table->string('description')->nullable()->after('name');
            }

            if (!Schema::hasColumn('roles', 'permissions')) {
                $table->json('permissions')->nullable()->after('description');
            }
        });

        DB::table('roles')->where('name', 'admin')->update([
            'description' => 'Full CMS administrator',
            'permissions' => json_encode([
                'users_locations',
                'reporting_lines',
                'locations',
                'regionals',
                'evaluation_masters',
                'role_management',
            ]),
        ]);

        DB::table('roles')->where('name', 'user')->update([
            'description' => 'Operational app user',
            'permissions' => json_encode([]),
        ]);
    }

    public function down()
    {
        Schema::table('roles', function (Blueprint $table) {
            if (Schema::hasColumn('roles', 'permissions')) {
                $table->dropColumn('permissions');
            }

            if (Schema::hasColumn('roles', 'description')) {
                $table->dropColumn('description');
            }
        });
    }
};
