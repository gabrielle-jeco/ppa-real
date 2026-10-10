<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('scoring_rules')) {
            return;
        }

        DB::table('scoring_rules')->orderBy('id')->each(function ($rule) {
            DB::table('scoring_rules')->where('id', $rule->id)->update([
                'attendance_included_statuses' => $this->withoutOff($rule->attendance_included_statuses),
                'task_excluded_statuses' => $this->withoutOff($rule->task_excluded_statuses),
            ]);
        });
    }

    public function down(): void
    {
        // OFF was an invalid duplicate of O, so rolling back must not reintroduce it.
    }

    private function withoutOff(string $encodedStatuses): string
    {
        $statuses = json_decode($encodedStatuses, true) ?: [];

        return json_encode(array_values(array_filter(
            $statuses,
            fn($status) => strtoupper(trim((string) $status)) !== 'OFF'
        )));
    }
};
