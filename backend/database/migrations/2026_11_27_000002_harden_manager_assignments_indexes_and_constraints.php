<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('manager_task_assignment_batches', function (Blueprint $table) {
            $table->index('created_by', 'mtab_created_by_idx');
        });

        Schema::table('manager_tasks', function (Blueprint $table) {
            $table->index('assignment_batch_id', 'mt_assignment_batch_id_idx');
            $table->index(['status', 'start_at'], 'mt_status_start_at_idx');
            $table->index(['status', 'due_at'], 'mt_status_due_at_idx');
            $table->index('approval_deadline_at', 'mt_approval_deadline_at_idx');
        });

        Schema::table('manager_task_evidences', function (Blueprint $table) {
            $table->index('reviewed_by', 'mte_reviewed_by_idx');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                DO \$\$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'mt_status_check'
                          AND conrelid = 'public.manager_tasks'::regclass
                    ) THEN
                        ALTER TABLE public.manager_tasks
                            ADD CONSTRAINT mt_status_check CHECK (status IN ('pending', 'approved', 'rejected'));
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'mte_review_status_check'
                          AND conrelid = 'public.manager_task_evidences'::regclass
                    ) THEN
                        ALTER TABLE public.manager_task_evidences
                            ADD CONSTRAINT mte_review_status_check CHECK (review_status IN ('pending', 'approved', 'rejected'));
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'mte_attempt_no_check'
                          AND conrelid = 'public.manager_task_evidences'::regclass
                    ) THEN
                        ALTER TABLE public.manager_task_evidences
                            ADD CONSTRAINT mte_attempt_no_check CHECK (attempt_no BETWEEN 1 AND 3);
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'mte_type_check'
                          AND conrelid = 'public.manager_task_evidences'::regclass
                    ) THEN
                        ALTER TABLE public.manager_task_evidences
                            ADD CONSTRAINT mte_type_check CHECK (type = 'after');
                    END IF;
                END \$\$;
            ");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE public.manager_task_evidences DROP CONSTRAINT IF EXISTS mte_type_check');
            DB::statement('ALTER TABLE public.manager_task_evidences DROP CONSTRAINT IF EXISTS mte_attempt_no_check');
            DB::statement('ALTER TABLE public.manager_task_evidences DROP CONSTRAINT IF EXISTS mte_review_status_check');
            DB::statement('ALTER TABLE public.manager_tasks DROP CONSTRAINT IF EXISTS mt_status_check');
        }

        Schema::table('manager_task_evidences', function (Blueprint $table) {
            $table->dropIndex('mte_reviewed_by_idx');
        });

        Schema::table('manager_tasks', function (Blueprint $table) {
            $table->dropIndex('mt_approval_deadline_at_idx');
            $table->dropIndex('mt_status_due_at_idx');
            $table->dropIndex('mt_status_start_at_idx');
            $table->dropIndex('mt_assignment_batch_id_idx');
        });

        Schema::table('manager_task_assignment_batches', function (Blueprint $table) {
            $table->dropIndex('mtab_created_by_idx');
        });
    }
};
