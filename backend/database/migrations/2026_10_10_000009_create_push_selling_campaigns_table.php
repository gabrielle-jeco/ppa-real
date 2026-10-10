<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('push_selling_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('location_id');
            $table->string('plu', 100);
            $table->string('product_name');
            $table->date('start_date');
            $table->date('end_date');
            $table->boolean('is_active')->default(true);
            $table->string('created_by');
            $table->string('updated_by')->nullable();
            $table->timestamps();

            $table->foreign('location_id')->references('initial')->on('locations')->cascadeOnDelete();
            $table->foreign('created_by')->references('username')->on('users')->cascadeOnDelete();
            $table->foreign('updated_by')->references('username')->on('users')->nullOnDelete();
            $table->index(['location_id', 'is_active', 'start_date', 'end_date'], 'push_selling_campaigns_location_status_period_index');
            $table->index(['location_id', 'plu'], 'push_selling_campaigns_location_plu_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_selling_campaigns');
    }
};
