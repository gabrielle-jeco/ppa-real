<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement(<<<'SQL'
                DO $$
                DECLARE
                    r RECORD;
                BEGIN
                    -- Drop composite reporting_lines FKs dynamically (handles PG 63-byte NAMEDATALEN truncation).
                    FOR r IN
                        SELECT conrelid::regclass AS tbl, conname
                        FROM pg_constraint
                        WHERE contype = 'f'
                          AND conrelid IN ('public.tasks'::regclass, 'public.monthly_personality_evaluations'::regclass)
                          AND confrelid = 'public.reporting_lines'::regclass
                    LOOP
                        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
                    END LOOP;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'tasks_employer_id_users_fk'
                          AND conrelid = 'public.tasks'::regclass
                    ) THEN
                        ALTER TABLE public.tasks
                            ADD CONSTRAINT tasks_employer_id_users_fk
                            FOREIGN KEY (employer_id) REFERENCES public.users(username) ON DELETE RESTRICT;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'tasks_employee_id_users_fk'
                          AND conrelid = 'public.tasks'::regclass
                    ) THEN
                        ALTER TABLE public.tasks
                            ADD CONSTRAINT tasks_employee_id_users_fk
                            FOREIGN KEY (employee_id) REFERENCES public.users(username) ON DELETE RESTRICT;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'mpe_evaluator_id_users_fk'
                          AND conrelid = 'public.monthly_personality_evaluations'::regclass
                    ) THEN
                        ALTER TABLE public.monthly_personality_evaluations
                            ADD CONSTRAINT mpe_evaluator_id_users_fk
                            FOREIGN KEY (evaluator_id) REFERENCES public.users(username) ON DELETE RESTRICT;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'mpe_evaluatee_id_users_fk'
                          AND conrelid = 'public.monthly_personality_evaluations'::regclass
                    ) THEN
                        ALTER TABLE public.monthly_personality_evaluations
                            ADD CONSTRAINT mpe_evaluatee_id_users_fk
                            FOREIGN KEY (evaluatee_id) REFERENCES public.users(username) ON DELETE RESTRICT;
                    END IF;
                END $$;
            SQL);

            DB::statement(
                'CREATE UNIQUE INDEX IF NOT EXISTS mpe_unique_eval_period_type_idx '
                . 'ON public.monthly_personality_evaluations (evaluatee_id, evaluator_id, evaluation_period, evaluation_type)'
            );

            return;
        }

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['employer_id', 'employee_id']);
            $table->foreign('employer_id', 'tasks_employer_id_users_fk')
                ->references('username')
                ->on('users')
                ->restrictOnDelete();
            $table->foreign('employee_id', 'tasks_employee_id_users_fk')
                ->references('username')
                ->on('users')
                ->restrictOnDelete();
        });

        Schema::table('monthly_personality_evaluations', function (Blueprint $table) {
            $table->dropForeign(['evaluator_id', 'evaluatee_id']);
            $table->foreign('evaluator_id', 'mpe_evaluator_id_users_fk')
                ->references('username')
                ->on('users')
                ->restrictOnDelete();
            $table->foreign('evaluatee_id', 'mpe_evaluatee_id_users_fk')
                ->references('username')
                ->on('users')
                ->restrictOnDelete();
            $table->unique(
                ['evaluatee_id', 'evaluator_id', 'evaluation_period', 'evaluation_type'],
                'mpe_unique_eval_period_type_idx'
            );
        });
    }

    public function down(): void
    {
        // Note: Re-attaching the composite FKs to reporting_lines requires all historical pairs
        // in tasks and monthly_personality_evaluations to exist in reporting_lines.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS public.mpe_unique_eval_period_type_idx');
            DB::statement('ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_employer_id_users_fk');
            DB::statement('ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_employee_id_users_fk');
            DB::statement('ALTER TABLE public.monthly_personality_evaluations DROP CONSTRAINT IF EXISTS mpe_evaluator_id_users_fk');
            DB::statement('ALTER TABLE public.monthly_personality_evaluations DROP CONSTRAINT IF EXISTS mpe_evaluatee_id_users_fk');

            DB::statement(<<<'SQL'
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'tasks_employer_id_employee_id_foreign'
                          AND conrelid = 'public.tasks'::regclass
                    ) THEN
                        ALTER TABLE public.tasks
                            ADD CONSTRAINT tasks_employer_id_employee_id_foreign
                            FOREIGN KEY (employer_id, employee_id)
                            REFERENCES public.reporting_lines(leader_id, subordinate_id)
                            ON DELETE CASCADE;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'monthly_personality_evaluations_evaluator_id_evaluatee_id_forei'
                          AND conrelid = 'public.monthly_personality_evaluations'::regclass
                    ) THEN
                        ALTER TABLE public.monthly_personality_evaluations
                            ADD CONSTRAINT monthly_personality_evaluations_evaluator_id_evaluatee_id_forei
                            FOREIGN KEY (evaluator_id, evaluatee_id)
                            REFERENCES public.reporting_lines(leader_id, subordinate_id)
                            ON DELETE CASCADE;
                    END IF;
                END $$;
            SQL);

            return;
        }

        Schema::table('monthly_personality_evaluations', function (Blueprint $table) {
            $table->dropUnique('mpe_unique_eval_period_type_idx');
            $table->dropForeign('mpe_evaluator_id_users_fk');
            $table->dropForeign('mpe_evaluatee_id_users_fk');
            $table->foreign(['evaluator_id', 'evaluatee_id'])
                ->references(['leader_id', 'subordinate_id'])
                ->on('reporting_lines')
                ->onDelete('cascade');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign('tasks_employer_id_users_fk');
            $table->dropForeign('tasks_employee_id_users_fk');
            $table->foreign(['employer_id', 'employee_id'])
                ->references(['leader_id', 'subordinate_id'])
                ->on('reporting_lines')
                ->onDelete('cascade');
        });
    }
};
