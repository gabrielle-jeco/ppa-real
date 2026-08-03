<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class UserLoginEvent extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'role_type',
        'account_role',
        'login_source',
        'device_type',
        'login_at',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'login_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'username');
    }
}
