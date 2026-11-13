<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        DB::table('roles')
            ->whereRaw('LOWER(TRIM(name)) = ?', ['admin'])
            ->get(['id', 'permissions'])
            ->each(function ($role) {
                $permissions = json_decode($role->permissions ?: '[]', true) ?: [];
                if (!in_array('score_reports', $permissions, true)) {
                    $permissions[] = 'score_reports';
                }
                DB::table('roles')->where('id', $role->id)->update([
                    'permissions' => json_encode(array_values(array_unique($permissions))),
                ]);
            });
    }

    public function down(): void
    {
        DB::table('roles')
            ->get(['id', 'permissions'])
            ->each(function ($role) {
                $permissions = array_values(array_filter(
                    json_decode($role->permissions ?: '[]', true) ?: [],
                    fn($permission) => $permission !== 'score_reports'
                ));
                DB::table('roles')->where('id', $role->id)->update([
                    'permissions' => json_encode($permissions),
                ]);
            });
    }
};
