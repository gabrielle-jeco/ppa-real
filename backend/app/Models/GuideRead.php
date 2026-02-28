<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GuideRead extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'work_station_id',
        'read_date',
    ];

    protected $casts = [
        'read_date' => 'date',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function workStation()
    {
        return $this->belongsTo(WorkStation::class);
    }
}
