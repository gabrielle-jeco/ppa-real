<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Regional extends Model
{
    use HasFactory;

    protected $table = 'regional';

    protected $fillable = [
        'kode_regional',
        'nama_regional',
        'cabang',
    ];
}
