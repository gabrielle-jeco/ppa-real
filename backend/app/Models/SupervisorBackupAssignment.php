<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SupervisorBackupAssignment extends Model
{
    use HasFactory;

    protected $fillable = [
        'backup_request_id',
        'subordinate_id',
        'reporting_line_id',
        'created_temporary_line',
    ];

    protected $casts = [
        'created_temporary_line' => 'boolean',
    ];
}
