<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

class ScoringRule extends Model
{
    use HasFactory;

    protected $fillable = [
        'effective_from',
        'task_weight',
        'attendance_weight',
        'evaluation_weight',
        'attendance_target',
        'attendance_included_statuses',
        'task_excluded_statuses',
        'cashier_task_weight',
        'cashier_ibop_weight',
        'cashier_push_selling_weight',
        'created_by',
    ];

    protected $casts = [
        'effective_from' => 'date',
        'task_weight' => 'float',
        'attendance_weight' => 'float',
        'evaluation_weight' => 'float',
        'attendance_target' => 'integer',
        'attendance_included_statuses' => 'array',
        'task_excluded_statuses' => 'array',
        'cashier_task_weight' => 'float',
        'cashier_ibop_weight' => 'float',
        'cashier_push_selling_weight' => 'float',
    ];

    public static function configurationFor(Carbon $period): array
    {
        $defaults = config('scoring.default_rule');

        if (!Schema::hasTable('scoring_rules')) {
            return ['id' => null, 'effective_from' => null, ...$defaults];
        }

        $rule = self::whereDate('effective_from', '<=', $period->copy()->startOfMonth()->toDateString())
            ->orderByDesc('effective_from')
            ->orderByDesc('id')
            ->first();

        if (!$rule) {
            return ['id' => null, 'effective_from' => null, ...$defaults];
        }

        return [
            'id' => $rule->id,
            'effective_from' => $rule->effective_from->toDateString(),
            'task_weight' => (float) $rule->task_weight,
            'attendance_weight' => (float) $rule->attendance_weight,
            'evaluation_weight' => (float) $rule->evaluation_weight,
            'attendance_target' => (int) $rule->attendance_target,
            'attendance_included_statuses' => is_array($rule->attendance_included_statuses) ? $rule->attendance_included_statuses : $defaults['attendance_included_statuses'],
            'task_excluded_statuses' => is_array($rule->task_excluded_statuses) ? $rule->task_excluded_statuses : $defaults['task_excluded_statuses'],
            'cashier_task_weight' => (float) $rule->cashier_task_weight,
            'cashier_ibop_weight' => (float) $rule->cashier_ibop_weight,
            'cashier_push_selling_weight' => (float) $rule->cashier_push_selling_weight,
        ];
    }
}
