<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Location;
use App\Models\Role;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

class ManagerSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        // 1. Create Dummy Locations
        $locJakarta = Location::create(['name' => 'Yogya Jakarta (Tebet)', 'is_locked' => true, 'address' => 'Jl. Tebet Raya No. 1']);
        $locBandung = Location::create(['name' => 'Yogya Bandung (Riau)', 'is_locked' => true, 'address' => 'Jl. Riau No. 5']);

        // 2. Create Roles (Foundation)
        Role::create(['role_id' => 1, 'role_name' => 'Crew - Cashier']);
        Role::create(['role_id' => 2, 'role_name' => 'Crew - Fresh']);
        Role::create(['role_id' => 3, 'role_name' => 'Crew - Fashion']);

        // 3. Create Managers

        // SM (Store Manager) - Locked to Jakarta
        User::create([
            'full_name' => 'Budi Santoso (SM)',
            'username' => 'sm_jakarta',
            'password' => Hash::make('password'),
            'role_type' => 'manager',
            'manager_type' => 'SM',
            'location_id' => $locJakarta->location_id,
        ]);

        // SM (Store Manager) - Locked to Bandung
        User::create([
            'full_name' => 'Siti Aminah (SM)',
            'username' => 'sm_bandung',
            'password' => Hash::make('password'),
            'role_type' => 'manager',
            'manager_type' => 'SM',
            'location_id' => $locBandung->location_id,
        ]);

        // RM (Regional Manager) - Unlocked (No specific location, or can oversee many)
        User::create([
            'full_name' => 'Pak Bos Regional (RM)',
            'username' => 'rm_jabar',
            'password' => Hash::make('password'),
            'role_type' => 'manager',
            'manager_type' => 'RM',
            'location_id' => null, // RM might not be bound to one store
        ]);

        // RM (Regional Manager) - Demo
        User::updateOrCreate(
            ['username' => 'rm_demo'],
            [
                'full_name' => 'Regional Manager Demo',
                'password' => Hash::make('password'),
                'role_type' => 'manager',
                'manager_type' => 'RM',
                'location_id' => null, 
                'active' => true
            ]
        );

        $this->command->info('Managers seeded successfully!');
    }
}
