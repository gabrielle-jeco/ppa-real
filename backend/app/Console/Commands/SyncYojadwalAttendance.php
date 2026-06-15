<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\YojadwalPresenceService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SyncYojadwalAttendance extends Command
{
    protected $signature = 'attendance:sync-yojadwal
        {--nik=* : Specific NIK/username to sync. Can be provided multiple times.}
        {--month= : Month number, defaults to current month.}
        {--year= : Year number, defaults to current year.}';

    protected $description = 'Sync monthly attendance from YoJadwal presence API into the local attendances table.';

    public function handle(YojadwalPresenceService $presenceService): int
    {
        if (!$presenceService->enabled()) {
            $this->warn('YoJadwal/Yoabsen integration is disabled. Set YOJADWAL_ENABLED=true to sync.');
            return self::SUCCESS;
        }

        $month = (int) ($this->option('month') ?: Carbon::now()->month);
        $year = (int) ($this->option('year') ?: Carbon::now()->year);
        $niks = $this->option('nik');

        $totalRows = 0;
        if (!empty($niks)) {
            foreach ($niks as $nik) {
                $totalRows += $this->syncNik($presenceService, (string) $nik, $month, $year);
            }
        } else {
            User::without(['jobLevel', 'locations', 'userLocations'])
                ->where('active', true)
                ->whereHas('userLocations', function ($query) {
                    $query->whereIn('job_level', ['sc', 'supervisor', 'manager', 'regional_manager']);
                })
                ->orderBy('id')
                ->select(['id', 'username'])
                ->chunkById(250, function ($users) use ($presenceService, $month, $year, &$totalRows) {
                    foreach ($users as $user) {
                        $totalRows += $this->syncNik($presenceService, (string) $user->username, $month, $year);
                    }
                });
        }

        $this->info("Done. {$totalRows} attendance rows synced for {$month}/{$year}.");
        return self::SUCCESS;
    }

    private function syncNik(YojadwalPresenceService $presenceService, string $nik, int $month, int $year): int
    {
        $count = $presenceService->syncMonth($nik, $month, $year);
        $this->line("{$nik}: {$count} attendance rows synced.");

        return $count;
    }
}
