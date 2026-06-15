<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE INDEX IF NOT EXISTS users_initial_store_index ON users (initial_store)');
        DB::statement('CREATE INDEX IF NOT EXISTS user_locations_location_id_index ON user_locations (location_id)');
        DB::statement('CREATE INDEX IF NOT EXISTS user_locations_job_level_index ON user_locations (job_level)');
        DB::statement('CREATE INDEX IF NOT EXISTS reporting_lines_leader_status_index ON reporting_lines (leader_id, status)');
        DB::statement('CREATE INDEX IF NOT EXISTS reporting_lines_subordinate_status_index ON reporting_lines (subordinate_id, status)');
        DB::statement('CREATE INDEX IF NOT EXISTS tasks_employee_due_at_index ON tasks (employee_id, due_at)');
        DB::statement('CREATE INDEX IF NOT EXISTS tasks_employer_employee_due_at_index ON tasks (employer_id, employee_id, due_at)');
        DB::statement('CREATE INDEX IF NOT EXISTS activity_logs_user_created_at_index ON activity_logs (user_id, created_at)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_initial_store_index');
        DB::statement('DROP INDEX IF EXISTS user_locations_location_id_index');
        DB::statement('DROP INDEX IF EXISTS user_locations_job_level_index');
        DB::statement('DROP INDEX IF EXISTS reporting_lines_leader_status_index');
        DB::statement('DROP INDEX IF EXISTS reporting_lines_subordinate_status_index');
        DB::statement('DROP INDEX IF EXISTS tasks_employee_due_at_index');
        DB::statement('DROP INDEX IF EXISTS tasks_employer_employee_due_at_index');
        DB::statement('DROP INDEX IF EXISTS activity_logs_user_created_at_index');
    }
};
