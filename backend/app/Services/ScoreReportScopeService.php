<?php

namespace App\Services;

use App\Models\Location;
use App\Models\Regional;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class ScoreReportScopeService
{
    public function __construct(private ManagerScopeService $managerScope)
    {
    }

    public function managerOptions(User $user): array
    {
        abort_unless($user->role_type === 'manager', 403, 'Tidak memiliki akses.');
        $user->loadMissing('locations');
        $isRegionalManager = $user->manager_type === 'RM';
        $locations = ($isRegionalManager ? $user->locations : $this->managerScope->accessibleLocations($user))
            ->filter(fn(Location $location) => (bool) $location->is_active)
            ->unique('initial')->sortBy('name')->values();
        $primary = $locations->firstWhere('initial', $user->initial_store);
        if (!$primary && !$isRegionalManager) {
            $primary = $locations->first();
        }
        if (!$primary) {
            throw ValidationException::withMessages(['location' => ['Cabang utama akun belum tersedia atau belum ditugaskan. Hubungi admin.']]);
        }

        $regionals = Regional::orderBy('kode_regional')->get()
            ->filter(fn(Regional $regional) => $regional->includesLocation($primary));
        if ($regionals->count() !== 1) {
            throw ValidationException::withMessages(['regional' => ['Cabang utama harus terhubung ke tepat satu Master Regional. Hubungi admin.']]);
        }
        $regional = $regionals->first();
        $locations = $locations->filter(fn(Location $location) => $regional->includesLocation($location))->values();

        return [
            'regionals' => [$regional->only(['kode_regional', 'nama_regional', 'cabang'])],
            'locations' => $locations->map(fn(Location $location) => $location->only(['initial', 'name', 'region_code', 'is_active']))->all(),
            'locked_regional' => $regional->kode_regional,
            'locked_location' => $isRegionalManager ? null : $primary->initial,
        ];
    }

    public function filters(User $user, array $filters): array
    {
        if ($user->role_type === 'manager') {
            $options = $this->managerOptions($user);
            abort_if(!empty($filters['regional']) && $filters['regional'] !== $options['locked_regional'], 403, 'Tidak memiliki akses regional tersebut.');
            $filters['regional'] = $options['locked_regional'];
            if ($options['locked_location'] !== null) {
                abort_if(!empty($filters['location']) && $filters['location'] !== $options['locked_location'], 403, 'Tidak memiliki akses cabang tersebut.');
                $filters['location'] = $options['locked_location'];
            } elseif (!empty($filters['location'])) {
                abort_unless(in_array($filters['location'], array_column($options['locations'], 'initial'), true), 403, 'Tidak memiliki akses cabang tersebut.');
            }
        }

        $errors = [];
        if (empty($filters['regional'])) {
            $errors['regional'] = ['Pilih regional sebelum menampilkan data.'];
        }
        if (empty($filters['location'])) {
            $errors['location'] = ['Pilih cabang sebelum menampilkan data.'];
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $filters;
    }
}
