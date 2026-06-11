<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EvaluationMaster extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'subtitle',
        'question',
        'answers',
        'sort_order',
        'active',
    ];

    protected $casts = [
        'answers' => 'array',
        'active' => 'boolean',
    ];
}

