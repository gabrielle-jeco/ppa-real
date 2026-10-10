<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('divisions', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name')->unique();
            $table->string('group_code', 20);
            $table->foreignId('parent_id')->nullable()->constrained('divisions')->nullOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('visible_in_yodaily')->default(true);
            $table->timestamps();
        });

        $now = now();
        foreach ([
            ['code' => 'SPM', 'name' => 'Supermarket', 'group_code' => 'SPM', 'sort_order' => 10],
            ['code' => 'FSH', 'name' => 'Fashion', 'group_code' => 'FSH', 'sort_order' => 20],
            ['code' => 'YOEL', 'name' => 'Yoel', 'group_code' => 'YOEL', 'sort_order' => 30],
        ] as $division) {
            DB::table('divisions')->insert([
                ...$division,
                'parent_id' => null,
                'visible_in_yodaily' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $parentIds = DB::table('divisions')->whereIn('code', ['SPM', 'FSH'])->pluck('id', 'code');
        foreach ([
            ['code' => 'FOOD-SPM', 'name' => 'Food-SPM', 'group_code' => 'SPM', 'parent' => 'SPM', 'sort_order' => 11],
            ['code' => 'NON-FOOD-SPM', 'name' => 'Non Food-SPM', 'group_code' => 'SPM', 'parent' => 'SPM', 'sort_order' => 12],
            ['code' => 'GMS-SPM', 'name' => 'GMS-SPM', 'group_code' => 'SPM', 'parent' => 'SPM', 'sort_order' => 13],
            ['code' => 'FRESH-SPM', 'name' => 'Fresh-SPM', 'group_code' => 'SPM', 'parent' => 'SPM', 'sort_order' => 14],
            ['code' => 'MENS-FSH', 'name' => 'Mens-FSH', 'group_code' => 'FSH', 'parent' => 'FSH', 'sort_order' => 21],
            ['code' => 'LADIES-FSH', 'name' => 'Ladies-FSH', 'group_code' => 'FSH', 'parent' => 'FSH', 'sort_order' => 22],
            ['code' => 'BABY-KIDS-FSH', 'name' => 'Baby & Kids-FSH', 'group_code' => 'FSH', 'parent' => 'FSH', 'sort_order' => 23],
            ['code' => 'SHOES-BAGS-FSH', 'name' => 'Shoes & Bags-FSH', 'group_code' => 'FSH', 'parent' => 'FSH', 'sort_order' => 24],
        ] as $division) {
            DB::table('divisions')->insert([
                'code' => $division['code'],
                'name' => $division['name'],
                'group_code' => $division['group_code'],
                'parent_id' => $parentIds[$division['parent']],
                'sort_order' => $division['sort_order'],
                'visible_in_yodaily' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('division_id')->nullable()->after('job_level_id')->constrained('divisions')->nullOnDelete();
        });

        $this->updateAdminPermission(true);
    }

    public function down(): void
    {
        $this->updateAdminPermission(false);

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('division_id');
        });

        Schema::dropIfExists('divisions');
    }

    private function updateAdminPermission(bool $add): void
    {
        if (!Schema::hasTable('roles') || !Schema::hasColumn('roles', 'permissions')) {
            return;
        }

        DB::table('roles')->whereRaw('LOWER(TRIM(name)) = ?', ['admin'])->get()->each(function ($role) use ($add) {
            $permissions = json_decode($role->permissions ?: '[]', true) ?: [];
            $permissions = array_values(array_filter($permissions, fn($permission) => $permission !== 'divisions'));
            if ($add) {
                $permissions[] = 'divisions';
            }

            DB::table('roles')->where('id', $role->id)->update([
                'permissions' => json_encode(array_values(array_unique($permissions))),
            ]);
        });
    }
};
