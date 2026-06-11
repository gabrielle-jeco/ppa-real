<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'description', 'permissions'];

    protected $casts = [
        'permissions' => 'array',
    ];

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function hasPermission(string $permission): bool
    {
        return strtolower(trim((string) $this->name)) === 'admin'
            || in_array($permission, $this->permissions ?: [], true);
    }

    public function isCmsRole(): bool
    {
        return strtolower(trim((string) $this->name)) === 'admin'
            || count($this->permissions ?: []) > 0;
    }
}

