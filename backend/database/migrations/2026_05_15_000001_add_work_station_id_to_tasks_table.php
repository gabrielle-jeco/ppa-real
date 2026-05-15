<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('work_station_id')
                ->nullable()
                ->after('employer_id')
                ->constrained('work_stations')
                ->nullOnDelete();

            $table->index('work_station_id');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['work_station_id']);
            $table->dropIndex(['work_station_id']);
            $table->dropColumn('work_station_id');
        });
    }
};
