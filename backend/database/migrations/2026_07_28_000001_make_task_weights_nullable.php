<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        foreach (['tasks', 'task_assignment_batches'] as $table) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            if (Schema::hasColumn($table, 'weight_label')) {
                DB::statement("ALTER TABLE {$table} ALTER COLUMN weight_label DROP DEFAULT");
                DB::statement("ALTER TABLE {$table} ALTER COLUMN weight_label DROP NOT NULL");
            }

            if (Schema::hasColumn($table, 'weight_value')) {
                DB::statement("ALTER TABLE {$table} ALTER COLUMN weight_value DROP DEFAULT");
                DB::statement("ALTER TABLE {$table} ALTER COLUMN weight_value DROP NOT NULL");
            }
        }
    }

    public function down(): void
    {
        foreach (['tasks', 'task_assignment_batches'] as $table) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            if (Schema::hasColumn($table, 'weight_label')) {
                DB::table($table)->whereNull('weight_label')->update(['weight_label' => 'mudah']);
                DB::statement("ALTER TABLE {$table} ALTER COLUMN weight_label SET DEFAULT 'mudah'");
                DB::statement("ALTER TABLE {$table} ALTER COLUMN weight_label SET NOT NULL");
            }

            if (Schema::hasColumn($table, 'weight_value')) {
                DB::table($table)->whereNull('weight_value')->update(['weight_value' => 2]);
                DB::statement("ALTER TABLE {$table} ALTER COLUMN weight_value SET DEFAULT 2");
                DB::statement("ALTER TABLE {$table} ALTER COLUMN weight_value SET NOT NULL");
            }
        }
    }
};
