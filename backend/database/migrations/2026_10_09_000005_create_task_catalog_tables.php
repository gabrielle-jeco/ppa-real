<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('task_areas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_station_id')->constrained('work_stations')->restrictOnDelete();
            $table->string('name');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['work_station_id', 'name']);
            $table->index(['work_station_id', 'active', 'sort_order']);
        });

        Schema::create('task_definitions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_area_id')->constrained('task_areas')->restrictOnDelete();
            $table->string('title');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['task_area_id', 'title']);
            $table->index(['task_area_id', 'active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_definitions');
        Schema::dropIfExists('task_areas');
    }
};
