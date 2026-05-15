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
        Schema::create('reporting_lines', function (Blueprint $table) {
            $table->id();
            $table->string('subordinate_id')->unique();
            $table->string('leader_id');
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();

            $table->foreign('subordinate_id')->references('username')->on('users')->cascadeOnDelete();
            $table->foreign('leader_id')->references('username')->on('users')->cascadeOnDelete();

            // Composite unique constraint for referencing in other tables (Tasks, Evaluations)
            $table->unique(['leader_id', 'subordinate_id']);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('reporting_lines');
    }
};
