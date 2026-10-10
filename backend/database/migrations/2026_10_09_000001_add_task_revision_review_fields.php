<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->timestamp('revision_deadline_at')->nullable()->after('approval_deadline_at');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
            DB::statement("ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying]::text[]))");
        }

        Schema::table('task_evidences', function (Blueprint $table) {
            $table->unsignedTinyInteger('attempt_no')->nullable()->after('type');
            $table->string('review_status', 20)->nullable()->after('attempt_no');
            $table->text('rejection_reason')->nullable()->after('review_status');
            $table->string('reviewed_by')->nullable()->after('rejection_reason');
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
            $table->decimal('awarded_score', 5, 2)->nullable()->after('reviewed_at');
            $table->index(['task_id', 'type', 'attempt_no'], 'task_evidence_attempt_index');
            $table->index(['task_id', 'review_status'], 'task_evidence_review_index');
        });
    }

    public function down(): void
    {
        DB::table('tasks')->where('status', 'rejected')->update(['status' => 'pending']);

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
            DB::statement("ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying]::text[]))");
        }

        Schema::table('task_evidences', function (Blueprint $table) {
            $table->dropIndex('task_evidence_attempt_index');
            $table->dropIndex('task_evidence_review_index');
            $table->dropColumn([
                'attempt_no',
                'review_status',
                'rejection_reason',
                'reviewed_by',
                'reviewed_at',
                'awarded_score',
            ]);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('revision_deadline_at');
        });
    }
};
