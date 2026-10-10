<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        foreach ($this->catalog() as $stationName => $areas) {
            $stationId = $this->findOrCreateStation($stationName);

            foreach ($areas as $areaOrder => $area) {
                $areaId = $this->findOrCreateArea($stationId, $area['name'], ($areaOrder + 1) * 10);

                foreach ($area['tasks'] as $taskOrder => $title) {
                    $existing = DB::table('task_definitions')
                        ->where('task_area_id', $areaId)
                        ->whereRaw('LOWER(title) = ?', [strtolower($title)])
                        ->first();

                    if ($existing) {
                        DB::table('task_definitions')->where('id', $existing->id)->update([
                            'sort_order' => ($taskOrder + 1) * 10,
                            'active' => true,
                            'updated_at' => now(),
                        ]);
                        continue;
                    }

                    DB::table('task_definitions')->insert([
                        'task_area_id' => $areaId,
                        'title' => $title,
                        'sort_order' => ($taskOrder + 1) * 10,
                        'active' => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        foreach ($this->catalog() as $stationName => $areas) {
            $station = DB::table('work_stations')
                ->whereRaw('LOWER(name) = ?', [strtolower($stationName)])
                ->orderBy('id')
                ->first();

            if (!$station) {
                continue;
            }

            foreach ($areas as $area) {
                $taskArea = DB::table('task_areas')
                    ->where('work_station_id', $station->id)
                    ->whereRaw('LOWER(name) = ?', [strtolower($area['name'])])
                    ->first();

                if (!$taskArea) {
                    continue;
                }

                DB::table('task_definitions')
                    ->where('task_area_id', $taskArea->id)
                    ->whereIn('title', $area['tasks'])
                    ->delete();

                if (!DB::table('task_definitions')->where('task_area_id', $taskArea->id)->exists()) {
                    DB::table('task_areas')->where('id', $taskArea->id)->delete();
                }
            }
        }
    }

    private function findOrCreateStation(string $name): int
    {
        $station = DB::table('work_stations')
            ->whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->orderBy('id')
            ->first();

        if ($station) {
            DB::table('work_stations')->where('id', $station->id)->update([
                'active' => true,
                'updated_at' => now(),
            ]);

            return $station->id;
        }

        return DB::table('work_stations')->insertGetId([
            'name' => $name,
            'guide_content' => json_encode([]),
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function findOrCreateArea(int $stationId, string $name, int $sortOrder): int
    {
        $area = DB::table('task_areas')
            ->where('work_station_id', $stationId)
            ->whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->first();

        if ($area) {
            DB::table('task_areas')->where('id', $area->id)->update([
                'sort_order' => $sortOrder,
                'active' => true,
                'updated_at' => now(),
            ]);

            return $area->id;
        }

        return DB::table('task_areas')->insertGetId([
            'work_station_id' => $stationId,
            'name' => $name,
            'sort_order' => $sortOrder,
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function catalog(): array
    {
        return [
            'sc' => [
                ['name' => 'FRESH', 'tasks' => [
                    'Kebersihan area display',
                    'Kerapihan display',
                    'Aroma area',
                    'Pajangan tampak penuh',
                    'POP terpasang',
                    'Harga/price tag terpasang',
                    'Harga sesuai dengan produk',
                    'Kemudahan konsumen berbelanja',
                    'Kualitas produk',
                    'Produk fresh tidak layu/rusak',
                    'Produk sesuai standar freshness',
                    'Lampu Dairy Chiller menyala semua',
                    'Suhu chiller sesuai standar',
                    'Kebersihan cool room',
                    'Kerapihan penyimpanan',
                    'Aroma cool room',
                    'FIFO berjalan',
                    'Preparation Fish & Meat sesuai standar',
                    'Arus lalu lintas barang lancar',
                ]],
                ['name' => 'GMS', 'tasks' => [
                    'Kebersihan area display',
                    'Kerapihan display',
                    'Pajangan tampak penuh',
                    'POP terpasang',
                    'POP sesuai periode promo',
                    'Harga/price tag terpasang',
                    'Harga sesuai dengan produk',
                    'Produk sesuai kelompok kategori',
                    'Kemudahan konsumen berbelanja',
                    'Kualitas produk layak jual',
                ]],
                ['name' => 'FASHION', 'tasks' => [
                    'Kebersihan area display',
                    'Kerapihan display',
                    'POP terpasang',
                    'POP sesuai periode promo',
                    'Informasi produk/harga (POP) sesuai',
                    'Harga/price tag terpasang',
                    'Penggunaan Barcode Scanner',
                    'Ketersediaan barang',
                    'Facing/penataan produk rapi',
                    'Produk sesuai kelompok/category',
                    'Kualitas produk',
                    'Kebersihan fitting room',
                    'Aroma fitting room',
                    'Kemudahan konsumen berbelanja',
                    'Kebersihan warehouse',
                    'Kerapihan warehouse',
                    'Kemudahan arus lalu lintas barang',
                    'FIFO',
                    'Barang tersimpan sesuai kategori',
                    'Tidak ada barang menghalangi jalur',
                ]],
                ['name' => 'TIMBANGAN', 'tasks' => [
                    'Petugas siap di area timbangan',
                    'Timbangan siap digunakan',
                    'Petugas memahami proses penimbangan',
                    'Personal Touch petugas',
                    'Sapaan kepada konsumen',
                    'Komunikasi ramah dan sopan',
                    'Area timbangan bersih',
                    'Informasi/harga sesuai produk',
                ]],
                ['name' => 'RECEIVING', 'tasks' => [
                    'Proses antrian sesuai nomor urut',
                    'Pemerataan jadwal pengiriman supplier',
                    'Area receiving bersih',
                    'Area receiving rapi',
                    'Pemisahan barang sudah dicek dan belum dicek jelas',
                    'Status pemeriksaan barang mudah dikenali',
                    'Jalur receiving tidak terhalang',
                ]],
                ['name' => 'WAREHOUSE SPM', 'tasks' => [
                    'Kebersihan warehouse',
                    'Kerapihan warehouse',
                    'Kemudahan arus lalu lintas barang',
                    'FIFO',
                    'Barang tersimpan sesuai kategori',
                    'Tidak ada barang menghalangi jalur',
                    'Area penyimpanan aman dan mudah diakses',
                ]],
                ['name' => 'SARANA & PRASARANA', 'tasks' => [
                    'Ketersediaan trolley',
                    'Ketersediaan keranjang belanja',
                    'Kebersihan trolley & keranjang',
                    'Ketersediaan pembungkus/plastik buah',
                    'Ketersediaan garpu/penjepit/peralatan fresh',
                    'Ketersediaan tempat cuci tangan di fresh',
                    'Kebersihan mushola',
                    'Kebersihan toilet umum',
                    'Ketersediaan perlengkapan toilet',
                    'Pengambilan sampah',
                    'Kebersihan Ruangan',
                    'Penyiraman Tanaman',
                ]],
                ['name' => 'FOOD STATION', 'tasks' => [
                    'Meja & kursi siap digunakan',
                    'Kebersihan & kerapihan dining',
                    'Side stand/service trolley bersih dan rapi',
                    'Kebersihan & kerapihan counter',
                    'Penataan produk',
                    'Ketersediaan produk yang dijual',
                    'Informasi produk',
                    'POP/informasi promo terpasang',
                    'Kualitas produk',
                    'Penanganan kompor & tabung gas aman',
                    'Petugas stand by dan siap melayani',
                    'Seragam/uniform sesuai standar',
                    'Penampilan/appearance sesuai standar',
                    'Personal Touch petugas',
                    'Sapaan dan komunikasi ramah',
                    'Panjang antrian terkendali',
                    'Jumlah kassa beroperasi sesuai kebutuhan',
                    'Personal Touch kasir',
                    'Kebersihan wastafel',
                    'Wastafel berfungsi baik',
                    'Kebersihan toilet',
                    'Toilet berfungsi baik',
                    'Ketersediaan perlengkapan toilet',
                    'APAR tersedia dan kondisi baik',
                    'Kebersihan area dishwashing',
                    'Kerapihan area dishwashing',
                    'Peralatan tersusun sesuai tempat',
                    'Kebersihan & kerapihan dapur',
                    'Penanganan bahan baku',
                    'FIFO bahan baku',
                    'Kebersihan & kerapihan gudang',
                    'Kemudahan arus lalu lintas barang',
                    'FIFO',
                    'Barang tersimpan sesuai kategori',
                ]],
            ],
            'cashier' => [
                ['name' => 'KASSA', 'tasks' => [
                    'Jumlah kassa beroperasi sesuai kebutuhan',
                    'Panjang antrian terkendali',
                    'Personal Touch kasir',
                    'Sapaan kepada konsumen',
                    'Komunikasi ramah dan sopan',
                    'Kecepatan pelayanan',
                    'Area kassa bersih dan rapi',
                    'POP/informasi promo di area kassa terpasang',
                ]],
            ],
        ];
    }
};
