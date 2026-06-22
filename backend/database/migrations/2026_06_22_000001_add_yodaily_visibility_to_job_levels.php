<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('job_levels', function (Blueprint $table) {
            if (!Schema::hasColumn('job_levels', 'position_code')) {
                $table->string('position_code')->nullable()->unique()->after('id');
            }
            if (!Schema::hasColumn('job_levels', 'grade')) {
                $table->string('grade')->nullable()->after('description');
            }
            if (!Schema::hasColumn('job_levels', 'department')) {
                $table->string('department')->nullable()->after('grade');
            }
            if (!Schema::hasColumn('job_levels', 'visible_in_yodaily')) {
                $table->boolean('visible_in_yodaily')->default(false)->after('department');
            }
            if (!Schema::hasColumn('job_levels', 'external_active')) {
                $table->boolean('external_active')->default(true)->after('visible_in_yodaily');
            }
            if (!Schema::hasColumn('job_levels', 'synced_at')) {
                $table->timestamp('synced_at')->nullable()->after('external_active');
            }
        });

        DB::table('job_levels')->whereNull('position_code')->update([
            'visible_in_yodaily' => true,
            'external_active' => true,
        ]);

        foreach ($this->positionCodes() as $row) {
            DB::table('job_levels')->updateOrInsert(
                ['position_code' => $row['position_code']],
                [
                    'name' => $row['position'],
                    'description' => $row['department'],
                    'grade' => $row['grade'],
                    'department' => $row['department'],
                    'visible_in_yodaily' => true,
                    'external_active' => true,
                    'synced_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }
    }

    public function down(): void
    {
        Schema::table('job_levels', function (Blueprint $table) {
            foreach (['position_code', 'grade', 'department', 'visible_in_yodaily', 'external_active', 'synced_at'] as $column) {
                if (Schema::hasColumn('job_levels', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }

    private function positionCodes(): array
    {
        return [
            ['position_code' => 'ST-SPM1-CAB-FOD13', 'position' => 'BUYER STORE FOOD', 'grade' => 'STAFF', 'department' => 'FOOD DEPARTEMEN'],
            ['position_code' => 'ST-SPM1-CAB-FRS23', 'position' => 'BUYER STORE FRESH', 'grade' => 'STAFF', 'department' => 'FRESH DEPARTEMEN'],
            ['position_code' => 'ST-SPM2-CAB-NFD13', 'position' => 'BUYER STORE NON FOOD', 'grade' => 'STAFF', 'department' => 'NON FOOD DEPARTEMEN'],
            ['position_code' => 'CF-OPR-CAB-OPR112', 'position' => 'CHIEF GENERAL AFFAIR', 'grade' => 'CHIEF', 'department' => 'OPERATION'],
            ['position_code' => 'CF-OPR-CAB-OPR111', 'position' => 'CHIEF INVENTORY CONTROL', 'grade' => 'CHIEF', 'department' => 'OPERATION'],
            ['position_code' => 'CF-OPR-CAB-SPM4', 'position' => 'CHIEF OPERATION AR. BERMAIN & CAFE', 'grade' => 'CHIEF', 'department' => 'OPERATION'],
            ['position_code' => 'CF-OPR-CAB-FSH1', 'position' => 'CHIEF OPERATION FASHION', 'grade' => 'CHIEF', 'department' => 'OPERATION'],
            ['position_code' => 'CF-OPR-CAB-SPM3', 'position' => 'CHIEF OPERATION SUPERMARKET', 'grade' => 'CHIEF', 'department' => 'OPERATION'],
            ['position_code' => 'CF-OPR-CAB-OPR114', 'position' => 'CHIEF VISUAL', 'grade' => 'CHIEF', 'department' => 'OPERATION'],
            ['position_code' => 'SM-OPR-CAB-FSH', 'position' => 'FASHION STORE MANAGER', 'grade' => 'MANAGER', 'department' => 'OPERATION'],
            ['position_code' => 'CF-OPR-CAB-OPR113', 'position' => 'REGIONAL GENERAL AFFAIR', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR17', 'position' => 'STAF CUSTOMER RELATION', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR12', 'position' => 'STAF RECEIVING GOODS', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR19', 'position' => 'STAF RECEIVING GOODS FASHION', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM2', 'position' => 'STAF RECEIVING GOODS SUPERMARKET', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR1121', 'position' => 'STAF VISUAL', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR1122', 'position' => 'STAFF FASHION STYLIST', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR1141', 'position' => 'STAFF GENERAL AFFAIR', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR13', 'position' => 'STAFF KEUANGAN 2', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR14', 'position' => 'STAFF KEUANGAN 3', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-HCLGALP-CAB-HR41', 'position' => 'STAFF PERSONALIA CABANG', 'grade' => 'STAFF', 'department' => 'HUMAN RESOURCE DEPARTEMEN'],
            ['position_code' => 'ST-OPR-CAB-SPM42', 'position' => 'STAFF TENANT RELATION (CABANG)', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'SM-OPR-CAB-OPR11', 'position' => 'STORE MANAGER', 'grade' => 'MANAGER', 'department' => 'OPERATION'],
            ['position_code' => 'SMP-OPR-CAB-OPR1', 'position' => 'STORE MANAGER PEMBINA', 'grade' => 'MANAGER', 'department' => 'OPERATION'],
            ['position_code' => 'SM-OPR-CAB-SPM', 'position' => 'STORE MANAGER SUPERMARKET', 'grade' => 'MANAGER', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-FSH16', 'position' => 'SUPERVISOR BABY & KIDS', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM39', 'position' => 'SUPERVISOR BAKERY (CABANG)', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-FSH14', 'position' => 'SUPERVISOR BEAUTY & ACC', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM43', 'position' => 'SUPERVISOR F&B', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-FSH17', 'position' => 'SUPERVISOR FASHION', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM31', 'position' => 'SUPERVISOR FOOD', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM41', 'position' => 'SUPERVISOR FOODCOURT', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM38', 'position' => 'SUPERVISOR FRESH (CABANG)', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM33', 'position' => 'SUPERVISOR GMS', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR15', 'position' => 'SUPERVISOR KASIR', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-FSH12', 'position' => 'SUPERVISOR LADIES WEAR', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-FSH13', 'position' => 'SUPERVISOR MENS WEAR', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM32', 'position' => 'SUPERVISOR NON FOOD', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-FSH15', 'position' => 'SUPERVISOR SHOES & BAG', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM35', 'position' => 'SUPERVISOR SUPERMARKET (FOOD-NON FOOD)', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM37', 'position' => 'SUPERVISOR SUPERMARKET (FOOD-NON FOOD-GMS)', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM36', 'position' => 'SUPERVISOR SUPERMARKET (GMS - YOEL)', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR18', 'position' => 'SUPERVISOR WARE HOUSE FASHION', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-OPR11', 'position' => 'SUPERVISOR WAREHOUSE', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM1', 'position' => 'SUPERVISOR WAREHOUSE SUPERMARKET', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'ST-OPR-CAB-SPM34', 'position' => 'SUPERVISOR YOGYA ELEKTRONIK', 'grade' => 'STAFF', 'department' => 'OPERATION'],
            ['position_code' => 'NST', 'position' => 'NST', 'grade' => 'NON STAFF', 'department' => null],
            ['position_code' => 'THL', 'position' => 'THL', 'grade' => 'Tenaga Harian Lepas', 'department' => null],
            ['position_code' => 'PKL', 'position' => 'PKL', 'grade' => 'Prakerin', 'department' => null],
        ];
    }
};
