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

    public function branchInitials(): array
    {
        return array_values(array_unique(array_filter(
            array_map('trim', explode(',', (string) $this->cabang)),
            fn(string $initial) => $initial !== ''
        )));
    }

    public function includesLocation(Location $location): bool
    {
        $branches = $this->branchInitials();
        if ($branches !== []) {
            return in_array($location->initial, $branches, true);
        }

        return ctype_digit((string) $this->kode_regional)
            && $location->region_code !== null
            && (int) $this->kode_regional === (int) $location->region_code;
    }
}
