<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id'); // corresponds to subordinate_id
            $table->foreignId('employer_id'); // corresponds to leader_id

            // Composite Foreign Key linking directly to reporting_lines
            $table->foreign(['employer_id', 'employee_id'])
                ->references(['leader_id', 'subordinate_id'])
                ->on('reporting_lines')
                ->onDelete('cascade');
            $table->foreignId('work_station_id')->nullable()->constrained('work_stations')->nullOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->dateTime('due_at');
            $table->enum('status', ['pending', 'approved'])->default('pending');
            $table->timestamp('guide_read_at')->nullable();
            $table->string('before_image')->nullable();
            $table->string('after_image')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('tasks');
    }
};
