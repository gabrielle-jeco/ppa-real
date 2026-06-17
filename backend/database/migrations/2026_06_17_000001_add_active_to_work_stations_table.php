<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('work_stations', function (Blueprint $table) {
            if (!Schema::hasColumn('work_stations', 'active')) {
                $table->boolean('active')->default(true)->after('guide_content');
            }
        });
    }

    public function down(): void
    {
        Schema::table('work_stations', function (Blueprint $table) {
            if (Schema::hasColumn('work_stations', 'active')) {
                $table->dropColumn('active');
            }
        });
    }
};
