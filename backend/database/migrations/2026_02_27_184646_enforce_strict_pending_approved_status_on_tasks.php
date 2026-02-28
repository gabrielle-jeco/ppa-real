<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('tasks', function (Blueprint $table) {
            // Update any existing submitted/completed tasks back to pending
            DB::table('tasks')->whereNotIn('status', ['pending', 'approved'])->update(['status' => 'pending']);

            // Re-create check constraint strictly for pending/approved
            DB::statement('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
            DB::statement("ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying]::text[]))");
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('tasks', function (Blueprint $table) {
            // Revert back
            DB::statement('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
            DB::statement("ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status::text = ANY (ARRAY['pending'::character varying, 'submitted'::character varying, 'completed'::character varying, 'approved'::character varying]::text[]))");
        });
    }
};
