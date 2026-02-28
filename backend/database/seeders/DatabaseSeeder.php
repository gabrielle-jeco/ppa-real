<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\JobLevel;
use App\Models\WorkStation;
use App\Models\Location;
use App\Models\User;
use App\Models\UserLocation;
use App\Models\ReportingLine;

class DatabaseSeeder extends Seeder
{
    public function run()
    {
        // 1. Job Levels
        $crewLevel = JobLevel::create(['name' => 'crew', 'description' => 'Service Crew']);
        $spvLevel = JobLevel::create(['name' => 'supervisor', 'description' => 'Store Supervisor']);
        $managerLevel = JobLevel::create(['name' => 'manager', 'description' => 'Regional/Store Manager']);

        // 2. Work Stations
        WorkStation::create(['name' => 'cashier', 'guide_content' => ['Check register', 'Greet customers']]);
        WorkStation::create(['name' => 'supermarket', 'guide_content' => ['Stock shelves', 'Check expiry dates']]);
        WorkStation::create(['name' => 'fashion', 'guide_content' => ['Fold clothes', 'Arrange mannequins']]);
        WorkStation::create(['name' => 'fresh', 'guide_content' => ['Sort vegetables', 'Check meat storage']]);

        // 3. Locations
        $locSudirman = Location::create(['name' => 'Yogya Sudirman']);
        $locThamrin = Location::create(['name' => 'Yogya Thamrin']);

        // 4. Users
        $password = Hash::make('password');

        // Manager
        $managerAnton = User::create([
            'name' => 'Anton Manager',
            'username' => 'anton_mgr',
            'email' => 'anton@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $managerLevel->id,
            'active' => true,
        ]);

        // Supervisors
        $spvSurya = User::create([
            'name' => 'Surya Supervisor',
            'username' => 'surya_spv',
            'email' => 'surya@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $spvLevel->id,
            'active' => true,
        ]);

        $spvAndi = User::create([
            'name' => 'Andi Supervisor',
            'username' => 'andi_spv',
            'email' => 'andi@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $spvLevel->id,
            'active' => true,
        ]);

        // Crews
        $crewBudi = User::create([
            'name' => 'Budi Crew',
            'username' => 'budi_crew',
            'email' => 'budi@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $crewLevel->id,
            'active' => true,
        ]);

        $crewDeni = User::create([
            'name' => 'Deni Crew',
            'username' => 'deni_crew',
            'email' => 'deni@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $crewLevel->id,
            'active' => true,
        ]);

        // 5. User Locations (Pivot Table)
        // Manager Anton holds both locations
        UserLocation::create(['user_id' => $managerAnton->id, 'location_id' => $locSudirman->id]);
        UserLocation::create(['user_id' => $managerAnton->id, 'location_id' => $locThamrin->id]);

        // Surya and his crews at Sudirman
        UserLocation::create(['user_id' => $spvSurya->id, 'location_id' => $locSudirman->id]);
        UserLocation::create(['user_id' => $crewBudi->id, 'location_id' => $locSudirman->id]);
        UserLocation::create(['user_id' => $crewDeni->id, 'location_id' => $locSudirman->id]);

        // Andi at Thamrin
        UserLocation::create(['user_id' => $spvAndi->id, 'location_id' => $locThamrin->id]);

        // 6. Reporting Lines
        // SPVs report to Manager
        ReportingLine::create(['subordinate_id' => $spvSurya->id, 'leader_id' => $managerAnton->id]);
        ReportingLine::create(['subordinate_id' => $spvAndi->id, 'leader_id' => $managerAnton->id]);

        // Crews report to SPV Surya
        ReportingLine::create(['subordinate_id' => $crewBudi->id, 'leader_id' => $spvSurya->id]);
        ReportingLine::create(['subordinate_id' => $crewDeni->id, 'leader_id' => $spvSurya->id]);

        $this->command->info('Database 3NF Seeder successfully populated!');
    }
}
