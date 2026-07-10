<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    private array $newPermissions = [
        'users_locations',
        'job_levels',
        'app_roles',
        'reporting_lines',
        'work_stations',
        'locations',
        'regionals',
        'evaluation_masters',
        'role_management',
    ];

    private array $oldPermissions = [
        'users_locations',
        'reporting_lines',
        'locations',
        'regionals',
        'evaluation_masters',
        'role_management',
    ];

    public function up(): void
    {
        DB::table('roles')
            ->whereRaw('LOWER(TRIM(name)) = ?', ['admin'])
            ->update(['permissions' => json_encode($this->newPermissions)]);
    }

    public function down(): void
    {
        DB::table('roles')
            ->whereRaw('LOWER(TRIM(name)) = ?', ['admin'])
            ->update(['permissions' => json_encode($this->oldPermissions)]);
    }
};
