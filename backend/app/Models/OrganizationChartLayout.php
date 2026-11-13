<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrganizationChartLayout extends Model
{
    protected $fillable = [
        'location_id',
        'layout',
        'updated_by',
    ];

    protected $casts = [
        'layout' => 'array',
    ];
}
