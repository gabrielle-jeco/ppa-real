<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('daily_scores', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->date('score_date');
            $table->string('category')->default('service_crew');
            $table->decimal('score', 5, 2)->nullable();
            $table->boolean('available')->default(false);
            $table->string('availability_mode', 10)->default('H');
            $table->string('unavailable_reason')->nullable();
            $table->string('attendance_status')->nullable();
            $table->unsignedInteger('approved_tasks')->default(0);
            $table->unsignedInteger('unapproved_tasks')->default(0);
            $table->foreignId('scoring_rule_id')->nullable()->constrained()->nullOnDelete();
            $table->json('details')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('username')->on('users')->cascadeOnDelete();
            $table->unique(['user_id', 'score_date', 'category']);
            $table->index(['score_date', 'available']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_scores');
    }
};
