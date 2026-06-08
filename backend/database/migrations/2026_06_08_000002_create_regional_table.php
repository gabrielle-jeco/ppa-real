<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        Schema::create('regional', function (Blueprint $table) {
            $table->id();
            $table->string('kode_regional')->unique();
            $table->string('nama_regional');
            $table->string('cabang')->nullable();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('regional');
    }
};
