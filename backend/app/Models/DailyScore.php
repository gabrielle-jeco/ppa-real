<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DailyScore extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'score_date',
        'category',
        'score',
        'available',
        'availability_mode',
        'unavailable_reason',
        'attendance_status',
        'approved_tasks',
        'unapproved_tasks',
        'scoring_rule_id',
        'details',
    ];

    protected $casts = [
        'score_date' => 'date',
        'score' => 'float',
        'available' => 'boolean',
        'approved_tasks' => 'integer',
        'unapproved_tasks' => 'integer',
        'details' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'username');
    }

    public function scoringRule()
    {
        return $this->belongsTo(ScoringRule::class);
    }
}
