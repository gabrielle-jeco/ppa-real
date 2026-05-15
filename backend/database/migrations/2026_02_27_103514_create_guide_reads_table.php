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
        Schema::create('guide_reads', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->foreignId('work_station_id')->constrained('work_stations')->onDelete('cascade');
            $table->date('read_date'); // To enforce daily uniqueness easily in Postgres
            $table->timestamps();

            $table->foreign('user_id')->references('username')->on('users')->cascadeOnDelete();

            // Ensure a user can only read a specific guide once per day
            $table->unique(['user_id', 'work_station_id', 'read_date'], 'user_guide_daily_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('guide_reads');
    }
};
