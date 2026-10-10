<?php

namespace Tests\Unit;

use App\Models\Attendance;
use App\Services\YojadwalAttendanceMapper;
use PHPUnit\Framework\TestCase;

class YojadwalAttendanceMapperTest extends TestCase
{
    public function test_it_preserves_the_four_canonical_business_statuses(): void
    {
        $payload = [
            'data' => [
                ['tanggal' => '2026-05-01', 'status_code' => 'H'],
                ['tanggal' => '2026-05-02', 'status_code' => 'OFF'],
                ['tanggal' => '2026-05-03', 'status_code' => 'O'],
                ['tanggal' => '2026-05-04', 'status_code' => 'OP'],
                ['tanggal' => '2026-05-05', 'status_code' => 'CT'],
            ],
        ];

        $rows = (new YojadwalAttendanceMapper())->mapPresenceResponse($payload, 5, 2026);

        $this->assertSame(['H', 'O', 'O', 'OP', 'CT'], array_column($rows, 'status_code'));
    }

    public function test_attendance_model_normalizes_legacy_aliases_without_changing_other_codes(): void
    {
        $attendance = new Attendance(['status_code' => ' libur ']);
        $this->assertSame('O', $attendance->status_code);

        $attendance->status_code = 'cuti';
        $this->assertSame('CT', $attendance->status_code);

        $attendance->status_code = 'IK';
        $this->assertSame('IK', $attendance->status_code);
    }
}
