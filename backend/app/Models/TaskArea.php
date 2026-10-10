<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskArea extends Model
{
    use HasFactory;

    protected $fillable = ['work_station_id', 'name', 'sort_order', 'active'];

    protected $casts = [
        'sort_order' => 'integer',
        'active' => 'boolean',
    ];

    public function workStation()
    {
        return $this->belongsTo(WorkStation::class);
    }

    public function taskDefinitions()
    {
        return $this->hasMany(TaskDefinition::class)
            ->orderBy('sort_order')
            ->orderBy('title');
    }
}
