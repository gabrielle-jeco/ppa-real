<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReportingLine extends Model
{
    use HasFactory;

    protected $fillable = ['subordinate_id', 'leader_id', 'status'];

    public function subordinate()
    {
        return $this->belongsTo(User::class, 'subordinate_id');
    }

    public function leader()
    {
        return $this->belongsTo(User::class, 'leader_id');
    }
}
