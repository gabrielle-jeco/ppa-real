<?php

use App\Models\JobLevel;
use App\Models\Location;
use App\Models\User;
use App\Models\UserLocation;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Hash;

return new class extends Migration {
    public function up()
    {
        $superadminLevel = JobLevel::firstOrCreate(
            ['name' => 'superadmin'],
            ['description' => 'System administrator for CMS and master data']
        );

        $superadmin = User::updateOrCreate(
            ['username' => '000001'],
            [
                'name' => 'YoDaily Superadmin',
                'email' => 'superadmin@yogyagroup.com',
                'password' => Hash::make('password'),
                'job_level_id' => $superadminLevel->id,
                'active' => true,
            ]
        );

        Location::pluck('initial')->each(function ($initial) use ($superadmin) {
            UserLocation::firstOrCreate([
                'user_id' => $superadmin->username,
                'location_id' => $initial,
            ]);
        });
    }

    public function down()
    {
        UserLocation::where('user_id', '000001')->delete();
        User::where('username', '000001')->delete();
    }
};
