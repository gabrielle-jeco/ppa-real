<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_login_events', function (Blueprint $table) {
            $table->string('device_type', 50)->nullable()->after('login_source');
        });
    }

    public function down(): void
    {
        Schema::table('user_login_events', function (Blueprint $table) {
            $table->dropColumn('device_type');
        });
    }
};
