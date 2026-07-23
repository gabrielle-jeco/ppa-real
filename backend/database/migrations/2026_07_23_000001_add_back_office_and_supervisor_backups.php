<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_back_office')->default(false)->after('active');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->timestamp('approval_deadline_at')->nullable()->after('due_at');
            $table->index(['status', 'approval_deadline_at'], 'tasks_status_approval_deadline_index');
        });

        Schema::create('supervisor_backup_requests', function (Blueprint $table) {
            $table->id();
            $table->string('requester_id');
            $table->string('backup_supervisor_id');
            $table->date('start_date');
            $table->date('end_date');
            $table->text('reason')->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();

            $table->foreign('requester_id')->references('username')->on('users')->cascadeOnDelete();
            $table->foreign('backup_supervisor_id')->references('username')->on('users')->cascadeOnDelete();
            $table->index(['requester_id', 'status', 'start_date', 'end_date'], 'backup_requester_period_index');
            $table->index(['backup_supervisor_id', 'status', 'start_date', 'end_date'], 'backup_target_period_index');
        });

        Schema::table('reporting_lines', function (Blueprint $table) {
            $table->string('relation_type')->default('permanent')->after('status');
            $table->foreignId('backup_request_id')->nullable()->after('relation_type')
                ->constrained('supervisor_backup_requests')->nullOnDelete();
            $table->date('effective_from')->nullable()->after('backup_request_id');
            $table->date('effective_until')->nullable()->after('effective_from');
            $table->index(['relation_type', 'effective_from', 'effective_until'], 'reporting_lines_effective_period_index');
        });

        Schema::create('supervisor_backup_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('backup_request_id')->constrained('supervisor_backup_requests')->cascadeOnDelete();
            $table->string('subordinate_id');
            $table->foreignId('reporting_line_id')->nullable()->constrained('reporting_lines')->nullOnDelete();
            $table->boolean('created_temporary_line')->default(false);
            $table->timestamps();

            $table->foreign('subordinate_id')->references('username')->on('users')->cascadeOnDelete();
            $table->unique(['backup_request_id', 'subordinate_id'], 'backup_request_subordinate_unique');
        });

        DB::statement("
            UPDATE tasks
            SET approval_deadline_at =
                date_trunc('day', tasks.due_at)
                + CASE WHEN COALESCE(users.is_back_office, false)
                    THEN interval '2 days'
                    ELSE interval '1 day'
                END
                - interval '1 second'
            FROM users
            WHERE users.username = tasks.employer_id
                AND tasks.approval_deadline_at IS NULL
        ");

        DB::statement("
            UPDATE tasks
            SET approval_deadline_at = date_trunc('day', due_at) + interval '1 day' - interval '1 second'
            WHERE approval_deadline_at IS NULL
        ");
    }

    public function down(): void
    {
        Schema::dropIfExists('supervisor_backup_assignments');

        Schema::table('reporting_lines', function (Blueprint $table) {
            $table->dropIndex('reporting_lines_effective_period_index');
            $table->dropConstrainedForeignId('backup_request_id');
            $table->dropColumn(['relation_type', 'effective_from', 'effective_until']);
        });

        Schema::dropIfExists('supervisor_backup_requests');

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex('tasks_status_approval_deadline_index');
            $table->dropColumn('approval_deadline_at');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_back_office');
        });
    }
};
