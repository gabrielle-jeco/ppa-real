<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up()
    {
        Schema::create('evaluation_masters', function (Blueprint $table) {
            $table->id();
            $table->string('title')->default('MONTHLY EVALUATION');
            $table->string('subtitle')->default('SIKAP KEPRIBADIAN');
            $table->string('question');
            $table->json('answers');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        DB::table('evaluation_masters')->insert([
            [
                'title' => 'MONTHLY EVALUATION',
                'subtitle' => 'SIKAP KEPRIBADIAN',
                'question' => 'Pengembangan Diri',
                'answers' => json_encode([
                    'Tidak memiliki kemampuan belajar hal baru',
                    'Tidak memiliki kemauan belajar hal baru',
                    'Mau belajar hal baru terkait pekerjaannya',
                    'Mau belajar hal baru bermanfaat untuk mengembangkan atau memudahkan pekerjaan',
                    'Memiliki keterampilan berbagai pekerjaan dan cepat menguasai hal baru.',
                ]),
                'sort_order' => 1,
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'title' => 'MONTHLY EVALUATION',
                'subtitle' => 'SIKAP KEPRIBADIAN',
                'question' => 'Kerjasama dan Komunikasi',
                'answers' => json_encode([
                    'Tidak dapat menyesuaikan diri + keluhan rekan',
                    'Sulit menyesuaikan diri tetapi tidak ada keluhan',
                    'Butuh Waktu penyesuaian dengan tim kerja',
                    'Mudah menyesuaikan diri tetapi terbatas pada bagian/departemen saja',
                    'Mampu menyesuaikan diri dimanapun & dengan sosialisasi tersebut kinerja tim meningkat.',
                ]),
                'sort_order' => 2,
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down()
    {
        Schema::dropIfExists('evaluation_masters');
    }
};

