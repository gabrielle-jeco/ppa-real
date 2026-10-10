<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('task_assignment_batches', function (Blueprint $table) {
            $table->foreignId('task_definition_id')
                ->nullable()
                ->after('work_station_id')
                ->constrained('task_definitions')
                ->restrictOnDelete();
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('task_definition_id')
                ->nullable()
                ->after('work_station_id')
                ->constrained('task_definitions')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('task_definition_id');
        });

        Schema::table('task_assignment_batches', function (Blueprint $table) {
            $table->dropConstrainedForeignId('task_definition_id');
        });
    }
};
