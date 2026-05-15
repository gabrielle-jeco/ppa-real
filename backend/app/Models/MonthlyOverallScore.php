<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MonthlyOverallScore extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'period',
        'final_score',
        'details'
    ];

    protected $casts = [
        'period' => 'date',
        'details' => 'array'
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'username');
    }
}
