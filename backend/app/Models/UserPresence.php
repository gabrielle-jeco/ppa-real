<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class UserPresence extends Model
{
    use HasFactory;

    protected $table = 'user_presence';

    protected $fillable = [
        'user_id',
        'device_key',
        'last_seen_at',
        'last_url',
        'device_type',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'last_seen_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'username');
    }
}
