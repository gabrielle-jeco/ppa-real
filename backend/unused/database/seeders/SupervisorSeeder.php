<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Location;
use Illuminate\Support\Facades\Hash;

class SupervisorSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        // Get Locations
        $jakarta = Location::where('name', 'like', '%Jakarta%')->first();
        $bandung = Location::where('name', 'like', '%Bandung%')->first();

        // 1. Create Supervisors for Jakarta (Report to sm_jakarta)
        $spvJakarta1 = User::create([
            'full_name' => 'Andi Supervisor (Fresh)',
            'username' => 'spv_jakarta_fresh',
            'password' => Hash::make('password'),
            'role_type' => 'supervisor',
            'location_id' => $jakarta->location_id,
            'active' => true
        ]);

        $spvJakarta2 = User::create([
            'full_name' => 'Budi Supervisor (Cashier)',
            'username' => 'spv_jakarta_cashier',
            'password' => Hash::make('password'),
            'role_type' => 'supervisor',
            'location_id' => $jakarta->location_id,
            'active' => true
        ]);

        // 2. Create Supervisors for Bandung (Report to sm_bandung)
        $spvBandung1 = User::create([
            'full_name' => 'Citra Supervisor (Fashion)',
            'username' => 'spv_bandung_fashion',
            'password' => Hash::make('password'),
            'role_type' => 'supervisor',
            'location_id' => $bandung->location_id,
            'active' => true
        ]);

        // Note: Actual relationship to Manager (manager_supervisor_assignments) 
        // will be seeded later when we build that table. 
        // For now, filtering by 'Location' is enough for SM to see them.

        $this->command->info('Supervisors seeded successfully!');
    }
}
