<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        Schema::create('evaluation_reopen_requests', function (Blueprint $table) {
            $table->id();
            $table->string('requester_id');
            $table->string('evaluatee_id');
            $table->date('evaluation_period');
            $table->string('evaluation_type')->default('personality');
            $table->unsignedTinyInteger('attempt');
            $table->string('status')->default('pending');
            $table->text('reason')->nullable();
            $table->string('reviewed_by')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->foreign('requester_id')->references('username')->on('users')->cascadeOnDelete();
            $table->foreign('evaluatee_id')->references('username')->on('users')->cascadeOnDelete();
            $table->foreign('reviewed_by')->references('username')->on('users')->nullOnDelete();
            $table->unique(
                ['requester_id', 'evaluatee_id', 'evaluation_period', 'evaluation_type', 'attempt'],
                'evaluation_reopen_attempt_unique'
            );
            $table->index(['requester_id', 'evaluatee_id', 'evaluation_period', 'evaluation_type'], 'evaluation_reopen_pair_period_index');
            $table->index(['status', 'expires_at'], 'evaluation_reopen_status_expiry_index');
        });
    }

    public function down()
    {
        Schema::dropIfExists('evaluation_reopen_requests');
    }
};
