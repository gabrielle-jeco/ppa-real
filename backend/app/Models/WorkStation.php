<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WorkStation extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'guide_content', 'active'];

    protected $casts = [
        'guide_content' => 'array',
        'active' => 'boolean',
    ];

    public function activityLogs()
    {
        return $this->hasMany(ActivityLog::class);
    }

    public function taskAreas()
    {
        return $this->hasMany(TaskArea::class)
            ->orderBy('sort_order')
            ->orderBy('name');
    }
}
