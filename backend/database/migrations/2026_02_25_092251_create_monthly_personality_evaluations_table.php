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
    public function up()
    {
        Schema::create('monthly_personality_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('evaluatee_id'); // corresponds to subordinate_id
            $table->foreignId('evaluator_id'); // corresponds to leader_id

            // Composite Foreign Key linking directly to reporting_lines
            $table->foreign(['evaluator_id', 'evaluatee_id'])
                ->references(['leader_id', 'subordinate_id'])
                ->on('reporting_lines')
                ->onDelete('cascade');
            $table->date('evaluation_period');
            $table->double('score');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('monthly_personality_evaluations');
    }
};
