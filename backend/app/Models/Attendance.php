<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'date', 'status_code'];

    public static function normalizeStatusCode(?string $status): string
    {
        $normalized = strtoupper(trim((string) $status));

        return match ($normalized) {
            'H', 'HADIR', 'PRESENT', 'MASUK' => 'H',
            'OP', 'OFF PENGGANTI', 'OFF_PENGGANTI', 'OFF-PENGGANTI' => 'OP',
            'O', 'OFF', 'L', 'LIBUR', 'HOLIDAY' => 'O',
            'CT', 'C', 'CUTI', 'LEAVE' => 'CT',
            default => $normalized,
        };
    }

    public function setStatusCodeAttribute(?string $value): void
    {
        $this->attributes['status_code'] = self::normalizeStatusCode($value);
    }

    public function getStatusCodeAttribute(?string $value): string
    {
        return self::normalizeStatusCode($value);
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'username');
    }
}
