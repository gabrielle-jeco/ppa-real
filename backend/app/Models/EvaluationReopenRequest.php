<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EvaluationReopenRequest extends Model
{
    use HasFactory;

    public const MAX_ATTEMPTS = 3;

    protected $fillable = [
        'requester_id',
        'evaluatee_id',
        'evaluation_period',
        'evaluation_type',
        'attempt',
        'status',
        'reason',
        'reviewed_by',
        'rejection_reason',
        'reviewed_at',
        'expires_at',
        'completed_at',
    ];

    protected $casts = [
        'evaluation_period' => 'date',
        'reviewed_at' => 'datetime',
        'expires_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function requester()
    {
        return $this->belongsTo(User::class, 'requester_id', 'username');
    }

    public function evaluatee()
    {
        return $this->belongsTo(User::class, 'evaluatee_id', 'username');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by', 'username');
    }
}
