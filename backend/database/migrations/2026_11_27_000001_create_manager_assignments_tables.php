<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('manager_task_assignment_batches', function (Blueprint $table) {
            $table->id();
            $table->string('created_by');
            $table->foreign('created_by')->references('username')->on('users')->restrictOnDelete();
            $table->string('assignment_type');
            $table->string('title');
            $table->text('target');
            $table->text('description')->nullable();
            $table->date('start_date'); $table->date('end_date');
            $table->time('start_time'); $table->time('due_time');
            $table->json('repeat_days')->nullable();
            $table->json('supervisor_ids');
            $table->timestamps();
        });
        Schema::create('manager_tasks', function (Blueprint $table) {
            $table->id();
            $table->string('employee_id'); $table->string('employer_id');
            $table->foreign('employee_id')->references('username')->on('users')->restrictOnDelete();
            $table->foreign('employer_id')->references('username')->on('users')->restrictOnDelete();
            $table->foreignId('assignment_batch_id')->nullable()->constrained('manager_task_assignment_batches')->nullOnDelete();
            $table->string('assignment_type')->default('individual');
            $table->string('title'); $table->text('target');
            $table->text('description')->nullable();
            $table->dateTime('start_at'); $table->dateTime('due_at');
            $table->dateTime('approval_deadline_at'); $table->dateTime('revision_deadline_at');
            $table->string('status')->default('pending');
            $table->timestamps();
            $table->index(['employee_id','start_at']);
            $table->index(['employer_id','status']);
        });
        Schema::create('manager_task_evidences', function (Blueprint $table) {
            $table->id(); $table->foreignId('task_id')->constrained('manager_tasks')->cascadeOnDelete();
            $table->string('file_path'); $table->string('type')->default('after');
            $table->unsignedTinyInteger('attempt_no');
            $table->string('review_status')->default('pending');
            $table->text('rejection_reason')->nullable();
            $table->string('reviewed_by')->nullable();
            $table->foreign('reviewed_by')->references('username')->on('users')->restrictOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->decimal('awarded_score',5,2)->nullable();
            $table->timestamps();
            $table->unique(['task_id','attempt_no']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manager_task_evidences');
        Schema::dropIfExists('manager_tasks');
        Schema::dropIfExists('manager_task_assignment_batches');
    }
};
