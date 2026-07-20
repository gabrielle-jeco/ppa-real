<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('task_assignment_batches', function (Blueprint $table) {
            $table->id();
            $table->string('created_by');
            $table->string('assignment_type')->default('individual');
            $table->string('title');
            $table->foreignId('work_station_id')->nullable()->constrained('work_stations')->nullOnDelete();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->time('start_time')->nullable();
            $table->time('due_time')->nullable();
            $table->json('repeat_days')->nullable();
            $table->json('crew_ids')->nullable();
            $table->string('weight_label')->default('mudah');
            $table->unsignedInteger('weight_value')->default(2);
            $table->text('description')->nullable();
            $table->timestamps();

            $table->foreign('created_by')->references('username')->on('users')->cascadeOnDelete();
            $table->index(['created_by', 'assignment_type']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'start_at')) {
                $table->dateTime('start_at')->nullable()->after('description');
            }
            if (!Schema::hasColumn('tasks', 'assignment_batch_id')) {
                $table->foreignId('assignment_batch_id')->nullable()->after('work_station_id')->constrained('task_assignment_batches')->nullOnDelete();
            }
            if (!Schema::hasColumn('tasks', 'assignment_type')) {
                $table->string('assignment_type')->default('individual')->after('assignment_batch_id');
            }
            if (!Schema::hasColumn('tasks', 'weight_label')) {
                $table->string('weight_label')->default('mudah')->after('status');
            }
            if (!Schema::hasColumn('tasks', 'weight_value')) {
                $table->unsignedInteger('weight_value')->default(2)->after('weight_label');
            }
        });

        DB::table('tasks')->whereNull('start_at')->update(['start_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            foreach (['weight_value', 'weight_label', 'assignment_type'] as $column) {
                if (Schema::hasColumn('tasks', $column)) {
                    $table->dropColumn($column);
                }
            }
            if (Schema::hasColumn('tasks', 'assignment_batch_id')) {
                $table->dropConstrainedForeignId('assignment_batch_id');
            }
            if (Schema::hasColumn('tasks', 'start_at')) {
                $table->dropColumn('start_at');
            }
        });

        Schema::dropIfExists('task_assignment_batches');
    }
};
