<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        if (!Schema::hasTable('app_roles')) {
            Schema::create('app_roles', function (Blueprint $table) {
                $table->id();
                $table->string('name')->unique();
                $table->string('description')->nullable();
                $table->boolean('active')->default(true);
                $table->timestamps();
            });
        }

        foreach ([
            ['name' => 'sc', 'description' => 'Service crew'],
            ['name' => 'supervisor', 'description' => 'Supervisor'],
            ['name' => 'manager', 'description' => 'Store manager'],
            ['name' => 'regional_manager', 'description' => 'Regional manager'],
        ] as $role) {
            DB::table('app_roles')->updateOrInsert(
                ['name' => $role['name']],
                [
                    'description' => $role['description'],
                    'active' => true,
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
        }
    }

    public function down()
    {
        Schema::dropIfExists('app_roles');
    }
};
