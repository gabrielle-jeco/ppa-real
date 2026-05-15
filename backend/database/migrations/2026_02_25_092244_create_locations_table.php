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
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->integer('store_code')->nullable();
            $table->string('initial')->nullable();
            $table->string('address')->nullable();
            $table->string('city')->nullable();
            $table->string('phone')->nullable();
            $table->integer('region_code')->nullable();
            $table->string('latitude')->nullable();
            $table->string('longitude')->nullable();
            $table->timestampTz('createdAt')->nullable();
            $table->timestampTz('updatedAt')->nullable();
            $table->integer('is_fnb')->nullable();
            $table->integer('is_fashion')->nullable();
            $table->integer('is_supermarket')->nullable();
            $table->integer('is_yogya_electronic')->nullable();
            $table->integer('is_food_court')->nullable();
            $table->string('open_hour')->nullable();
            $table->text('store_image1')->nullable();
            $table->text('store_image2')->nullable();
            $table->text('store_image3')->nullable();
            $table->text('store_description')->nullable();
            $table->integer('is_active')->nullable();
            $table->string('type_store')->nullable();
            $table->string('sm')->nullable();
            $table->timestamps();

            $table->unique('store_code', 'stores_store_code_uindex');
            $table->unique('initial', 'locations_initial_unique');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('locations');
    }
};
