<?php

namespace App\Services\External;

interface ExternalDataInterface
{
    /**
     * Get attendance data for a user on a specific date.
     * 
     * @param int $userId
     * @param string $date (Y-m-d)
     * @return array|null ['time_in' => '08:00', 'time_out' => '17:00']
     */
    public function getAttendance(int $userId, string $date);

    /**
     * Get sales data or other external metrics for a location.
     * 
     * @param int $locationId
     * @return array
     */
    public function getLocationMetrics(int $locationId);
}
