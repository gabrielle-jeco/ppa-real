<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('scoring_rules', function (Blueprint $table) {
            $table->id();
            $table->date('effective_from')->unique();
            $table->decimal('task_weight', 6, 3)->default(60);
            $table->decimal('attendance_weight', 6, 3)->default(25);
            $table->decimal('evaluation_weight', 6, 3)->default(15);
            $table->unsignedSmallInteger('attendance_target')->default(25);
            $table->json('attendance_included_statuses');
            $table->json('task_excluded_statuses');
            $table->decimal('cashier_task_weight', 7, 4)->default(33.3333);
            $table->decimal('cashier_ibop_weight', 7, 4)->default(33.3333);
            $table->decimal('cashier_push_selling_weight', 7, 4)->default(33.3334);
            $table->string('created_by')->nullable();
            $table->timestamps();
        });

        DB::table('scoring_rules')->insert([
            'effective_from' => '2000-01-01',
            'task_weight' => 60,
            'attendance_weight' => 25,
            'evaluation_weight' => 15,
            'attendance_target' => 25,
            'attendance_included_statuses' => json_encode(['H', 'O', 'OP', 'CT']),
            'task_excluded_statuses' => json_encode(['O', 'OP', 'CT']),
            'cashier_task_weight' => 33.3333,
            'cashier_ibop_weight' => 33.3333,
            'cashier_push_selling_weight' => 33.3334,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('scoring_rules');
    }
};
