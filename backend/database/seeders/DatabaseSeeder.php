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
        $crewLevel = JobLevel::create(['name' => 'crew', 'description' => 'Service Crew']);
        $spvLevel = JobLevel::create(['name' => 'supervisor', 'description' => 'Store Supervisor']);
        $managerLevel = JobLevel::create(['name' => 'manager', 'description' => 'Regional/Store Manager']);
        $superadminLevel = JobLevel::firstOrCreate(
            ['name' => 'superadmin'],
            ['description' => 'System administrator for CMS and master data']
        );

        WorkStation::create(['name' => 'cashier', 'guide_content' => ['Check register', 'Greet customers']]);
        WorkStation::create(['name' => 'supermarket', 'guide_content' => ['Stock shelves', 'Check expiry dates']]);
        WorkStation::create(['name' => 'fashion', 'guide_content' => ['Fold clothes', 'Arrange mannequins']]);
        WorkStation::create(['name' => 'fresh', 'guide_content' => ['Sort vegetables', 'Check meat storage']]);

        $locSudirman = Location::create([
            'name' => 'YOGYA SUDIRMAN',
            'store_code' => 101,
            'initial' => 'YSD',
            'address' => 'Jl. Jend. Sudirman No. 1',
            'city' => 'Bandung',
            'phone' => '022-0000001',
            'region_code' => 10,
            'latitude' => '-6.914744',
            'longitude' => '107.609810',
            'is_fnb' => 1,
            'is_fashion' => 1,
            'is_supermarket' => 1,
            'is_yogya_electronic' => 0,
            'is_food_court' => 1,
            'open_hour' => '08:00-21:00',
            'store_description' => 'Dummy store for YoDaily development.',
            'is_active' => 1,
            'type_store' => 'department_store',
            'sm' => '900001',
        ]);

        $locThamrin = Location::create([
            'name' => 'YOGYA THAMRIN',
            'store_code' => 102,
            'initial' => 'YTH',
            'address' => 'Jl. Thamrin No. 2',
            'city' => 'Jakarta',
            'phone' => '021-0000002',
            'region_code' => 11,
            'latitude' => '-6.194449',
            'longitude' => '106.822919',
            'is_fnb' => 1,
            'is_fashion' => 1,
            'is_supermarket' => 1,
            'is_yogya_electronic' => 1,
            'is_food_court' => 1,
            'open_hour' => '08:00-21:00',
            'store_description' => 'Dummy branch store for YoDaily development.',
            'is_active' => 1,
            'type_store' => 'department_store',
            'sm' => '900001',
        ]);

        $locCiamis = Location::create([
            'name' => 'YOGYA CIAMIS',
            'store_code' => 103,
            'initial' => 'YGC',
            'address' => 'Jl. Ciamis No. 3',
            'city' => 'Ciamis',
            'phone' => '0265-0000003',
            'region_code' => 12,
            'latitude' => '-7.325700',
            'longitude' => '108.353400',
            'is_fnb' => 1,
            'is_fashion' => 1,
            'is_supermarket' => 1,
            'is_yogya_electronic' => 0,
            'is_food_court' => 1,
            'open_hour' => '08:00-21:00',
            'store_description' => 'YoJadwal test store for YoDaily development.',
            'is_active' => 1,
            'type_store' => 'department_store',
            'sm' => '900001',
        ]);

        $password = Hash::make('password');

        $managerAnton = User::create([
            'name' => 'Anton Manager',
            'username' => '900001',
            'email' => 'anton@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $managerLevel->id,
            'active' => true,
        ]);

        $superadmin = User::updateOrCreate(
            ['username' => '000001'],
            [
                'name' => 'YoDaily Superadmin',
                'email' => 'superadmin@yogyagroup.com',
                'password' => $password,
                'job_level_id' => $superadminLevel->id,
                'active' => true,
            ]
        );

        $spvSurya = User::create([
            'name' => 'Surya Supervisor',
            'username' => '800001',
            'email' => 'surya@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $spvLevel->id,
            'active' => true,
        ]);

        $spvAndi = User::create([
            'name' => 'Andi Supervisor',
            'username' => '800002',
            'email' => 'andi@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $spvLevel->id,
            'active' => true,
        ]);

        $spvHaritsyah = User::create([
            'name' => 'HARITSYAH AGUSTIAN',
            'username' => '17070008',
            'email' => '17070008@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $spvLevel->id,
            'active' => true,
        ]);

        $crewBudi = User::create([
            'name' => 'Budi Crew',
            'username' => '700001',
            'email' => 'budi@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $crewLevel->id,
            'active' => true,
        ]);

        $crewDeni = User::create([
            'name' => 'Deni Crew',
            'username' => '700002',
            'email' => 'deni@yogyagroup.com',
            'password' => $password,
            'job_level_id' => $crewLevel->id,
            'active' => true,
        ]);

        UserLocation::create(['user_id' => $managerAnton->username, 'location_id' => $locSudirman->initial]);
        UserLocation::create(['user_id' => $managerAnton->username, 'location_id' => $locThamrin->initial]);
        UserLocation::create(['user_id' => $superadmin->username, 'location_id' => $locSudirman->initial]);
        UserLocation::create(['user_id' => $superadmin->username, 'location_id' => $locThamrin->initial]);
        UserLocation::create(['user_id' => $superadmin->username, 'location_id' => $locCiamis->initial]);

        UserLocation::create(['user_id' => $spvSurya->username, 'location_id' => $locSudirman->initial]);
        UserLocation::create(['user_id' => $crewBudi->username, 'location_id' => $locSudirman->initial]);
        UserLocation::create(['user_id' => $crewDeni->username, 'location_id' => $locSudirman->initial]);

        UserLocation::create(['user_id' => $spvAndi->username, 'location_id' => $locThamrin->initial]);
        UserLocation::create(['user_id' => $spvHaritsyah->username, 'location_id' => $locCiamis->initial]);

        ReportingLine::create(['subordinate_id' => $spvSurya->username, 'leader_id' => $managerAnton->username]);
        ReportingLine::create(['subordinate_id' => $spvAndi->username, 'leader_id' => $managerAnton->username]);
        ReportingLine::create(['subordinate_id' => $spvHaritsyah->username, 'leader_id' => $managerAnton->username]);

        ReportingLine::create(['subordinate_id' => $crewBudi->username, 'leader_id' => $spvSurya->username]);
        ReportingLine::create(['subordinate_id' => $crewDeni->username, 'leader_id' => $spvSurya->username]);

        $this->command->info('Database seeder populated with NIK-based dummy users.');
    }
}
