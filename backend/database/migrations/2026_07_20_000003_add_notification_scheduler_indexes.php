<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->index(['status', 'start_at'], 'tasks_status_start_at_index');
            $table->index(['status', 'due_at'], 'tasks_status_due_at_index');
        });

        Schema::table('monthly_personality_evaluations', function (Blueprint $table) {
            $table->index(
                ['evaluator_id', 'evaluation_period'],
                'monthly_evaluations_evaluator_period_index'
            );
        });
    }

    public function down(): void
    {
        Schema::table('monthly_personality_evaluations', function (Blueprint $table) {
            $table->dropIndex('monthly_evaluations_evaluator_period_index');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex('tasks_status_start_at_index');
            $table->dropIndex('tasks_status_due_at_index');
        });
    }
};
