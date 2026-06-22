<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class JobLevel extends Model
{
    use HasFactory;

    protected $fillable = [
        'position_code',
        'name',
        'description',
        'grade',
        'department',
        'visible_in_yodaily',
        'external_active',
        'synced_at',
    ];

    protected $casts = [
        'visible_in_yodaily' => 'boolean',
        'external_active' => 'boolean',
        'synced_at' => 'datetime',
    ];

    public function users()
    {
        return $this->hasMany(User::class);
    }
}
