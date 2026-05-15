<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Location extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'store_code',
        'initial',
        'address',
        'city',
        'phone',
        'region_code',
        'latitude',
        'longitude',
        'createdAt',
        'updatedAt',
        'is_fnb',
        'is_fashion',
        'is_supermarket',
        'is_yogya_electronic',
        'is_food_court',
        'open_hour',
        'store_image1',
        'store_image2',
        'store_image3',
        'store_description',
        'is_active',
        'type_store',
        'sm',
    ];

    public function users()
    {
        return $this->belongsToMany(User::class, 'user_locations', 'location_id', 'user_id', 'initial', 'username');
    }
}
