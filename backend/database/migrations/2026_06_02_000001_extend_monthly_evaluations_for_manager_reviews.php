<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        Schema::table('monthly_personality_evaluations', function (Blueprint $table) {
            $table->string('evaluation_type')->default('personality')->after('evaluation_period');
            $table->json('scores')->nullable()->after('score');
            $table->text('notes')->nullable()->after('scores');
        });
    }

    public function down()
    {
        Schema::table('monthly_personality_evaluations', function (Blueprint $table) {
            $table->dropColumn(['evaluation_type', 'scores', 'notes']);
        });
    }
};
