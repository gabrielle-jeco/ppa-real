<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('user_notifications', function (Blueprint $table) {
            $table->string('dedupe_key')->nullable()->after('recipient_id');
            $table->unique(['recipient_id', 'dedupe_key']);
        });
    }

    public function down(): void
    {
        Schema::table('user_notifications', function (Blueprint $table) {
            $table->dropUnique(['recipient_id', 'dedupe_key']);
            $table->dropColumn('dedupe_key');
        });
    }
};
