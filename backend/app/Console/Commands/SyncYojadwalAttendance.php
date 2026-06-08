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

        if (empty($niks)) {
            $niks = User::where('active', true)->get()
                ->filter(fn(User $user) => in_array($user->role_type, ['employee', 'crew', 'supervisor', 'manager'], true))
                ->pluck('username')
                ->all();
        }

        $totalRows = 0;
        foreach ($niks as $nik) {
            $count = $presenceService->syncMonth((string) $nik, $month, $year);
            $totalRows += $count;
            $this->line("{$nik}: {$count} attendance rows synced.");
        }

        $this->info("Done. {$totalRows} attendance rows synced for {$month}/{$year}.");
        return self::SUCCESS;
    }
}
