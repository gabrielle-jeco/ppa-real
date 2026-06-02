<?php

namespace App\Services\External;

class MockExternalDataProvider implements ExternalDataInterface
{
    public function getAttendance(int $userId, string $date)
    {
        // Placeholder data
        return [
            'time_in' => '08:00',
            'time_out' => '17:00',
            'status' => 'present'
        ];
    }

    public function getLocationMetrics(int $locationId)
    {
        return [
            'sales' => 1000000,
            'customer_count' => 150
        ];
    }
}
