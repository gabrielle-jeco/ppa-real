<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskEvidence extends Model
{
    use HasFactory;

    protected $table = 'task_evidences';

    protected $fillable = [
        'task_id',
        'file_path',
        'type',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class);
    }
}
