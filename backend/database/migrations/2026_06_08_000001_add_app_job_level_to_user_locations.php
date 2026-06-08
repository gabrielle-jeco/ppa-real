<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'initial_store')) {
                $table->string('initial_store')->nullable()->after('job_level_id');
            }
        });

        Schema::table('user_locations', function (Blueprint $table) {
            if (!Schema::hasColumn('user_locations', 'job_level')) {
                $table->string('job_level')->nullable()->after('location_id');
            }
        });

        DB::statement("
            UPDATE user_locations ul
            SET job_level = CASE LOWER(TRIM(jl.name))
                WHEN 'crew' THEN 'sc'
                WHEN 'employee' THEN 'sc'
                WHEN 'sc' THEN 'sc'
                WHEN 'supervisor' THEN 'supervisor'
                WHEN 'manager' THEN 'manager'
                WHEN 'regional_manager' THEN 'regional_manager'
                ELSE ul.job_level
            END
            FROM users u
            JOIN job_levels jl ON jl.id = u.job_level_id
            WHERE ul.user_id = u.username
              AND ul.job_level IS NULL
              AND LOWER(TRIM(jl.name)) <> 'superadmin'
        ");

        DB::statement("
            UPDATE users u
            SET initial_store = first_location.location_id
            FROM (
                SELECT DISTINCT ON (user_id) user_id, location_id
                FROM user_locations
                ORDER BY user_id, id
            ) AS first_location
            WHERE u.username = first_location.user_id
              AND u.initial_store IS NULL
        ");
    }

    public function down()
    {
        Schema::table('user_locations', function (Blueprint $table) {
            if (Schema::hasColumn('user_locations', 'job_level')) {
                $table->dropColumn('job_level');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'initial_store')) {
                $table->dropColumn('initial_store');
            }
        });
    }
};
