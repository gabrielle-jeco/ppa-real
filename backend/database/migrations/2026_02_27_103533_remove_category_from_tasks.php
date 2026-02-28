<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['work_station_id']);
            $table->dropColumn('work_station_id');
            $table->dropColumn('guide_read_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('work_station_id')->nullable()->constrained('work_stations')->onDelete('set null');
            $table->timestamp('guide_read_at')->nullable();
        });
    }
};
