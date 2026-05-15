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
        Schema::create('monthly_overall_scores', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('period'); // Represents the month, e.g., 2026-03-01
            $table->integer('final_score');
            $table->json('details')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('username')->on('users')->cascadeOnDelete();
            $table->unique(['user_id', 'period']);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('monthly_overall_scores');
    }
};
