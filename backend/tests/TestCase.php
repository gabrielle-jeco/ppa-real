<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function createBackupTables(): void
    {
        \Illuminate\Support\Facades\Schema::create('supervisor_backup_requests', function ($table) {
            $table->id(); $table->string('requester_id'); $table->string('backup_supervisor_id');
            $table->date('start_date'); $table->date('end_date'); $table->string('status');
            $table->timestamp('responded_at')->nullable(); $table->text('reason')->nullable(); $table->timestamps();
        });
        \Illuminate\Support\Facades\Schema::create('supervisor_backup_assignments', function ($table) {
            $table->id(); $table->unsignedBigInteger('backup_request_id'); $table->string('subordinate_id');
            $table->unsignedBigInteger('reporting_line_id')->nullable();
            $table->boolean('created_temporary_line')->default(false); $table->timestamps();
            $table->unique(['backup_request_id', 'subordinate_id']);
        });
    }
}
