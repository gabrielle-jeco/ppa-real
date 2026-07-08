<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        DB::statement('ALTER TABLE reporting_lines DROP CONSTRAINT IF EXISTS reporting_lines_subordinate_id_unique');
    }

    public function down(): void
    {
        Schema::table('reporting_lines', function (Blueprint $table) {
            $table->unique('subordinate_id');
        });
    }
};
