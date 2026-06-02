<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MonthlyPersonalityEvaluation extends Model
{
    use HasFactory;

    protected $fillable = [
        'evaluatee_id',
        'evaluator_id',
        'evaluation_period',
        'evaluation_type',
        'score',
        'scores',
        'notes',
    ];

    protected $casts = [
        'evaluation_period' => 'date',
        'scores' => 'array',
    ];

    public function evaluatee()
    {
        return $this->belongsTo(User::class, 'evaluatee_id', 'username');
    }

    public function evaluator()
    {
        return $this->belongsTo(User::class, 'evaluator_id', 'username');
    }
}
