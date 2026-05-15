<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('user_locations', function (Blueprint $table) {
            $table->id();
            $table->string('user_id');
            $table->string('location_id');
            $table->timestamps();

            $table->foreign('user_id')->references('username')->on('users')->cascadeOnDelete();
            $table->foreign('location_id')->references('initial')->on('locations')->cascadeOnDelete();
            $table->unique(['user_id', 'location_id']);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('user_locations');
    }
};
