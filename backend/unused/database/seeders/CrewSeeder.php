<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Location;
use Illuminate\Support\Facades\Hash;

class CrewSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        // 1. Clean Up Old Data (Optional, but keeps it idempotent like the route)
        User::where('username', 'supervisor_andi')->delete();
        User::where('email', 'like', 'crew_%@yogyagroup.com')->delete();

        // 2. Create Location
        $location = Location::firstOrCreate(
            ['name' => 'Fashion Bandung'],
            ['is_locked' => true, 'address' => 'Bandung City']
        );

        // 3. Create Supervisor
        // Check if exists to avoid duplicate error if 'Clean Up' didn't catch it for some reason, 
        // or just use create as in the route since we deleted above.
        $supervisor = User::create([
            'username' => 'supervisor_andi',
            'full_name' => 'Andi Supervisor',
            'email' => 'andi@yogyagroup.com',
            'password' => Hash::make('password'),
            'role_type' => 'supervisor',
            'manager_type' => null,
            'location_id' => $location->location_id,
            'active' => true
        ]);

        // 4. Create Crews
        $crews = ['Crew Alpha', 'Crew Beta', 'Crew Charlie'];
        foreach ($crews as $name) {
            User::create([
                'username' => strtolower(str_replace(' ', '_', $name)),
                'full_name' => $name,
                'email' => strtolower(str_replace(' ', '_', $name)) . '@yogyagroup.com',
                'password' => Hash::make('password'),
                'role_type' => 'employee', 
                'location_id' => $location->location_id,
                'active' => true
            ]);
        }
        
        $this->command->info('Crew and Supervisor Andi seeded successfully!');
    }
}
