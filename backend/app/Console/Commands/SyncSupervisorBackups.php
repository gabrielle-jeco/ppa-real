<?php

namespace App\Console\Commands;

use App\Models\SupervisorBackupRequest;
use App\Services\BackupMirrorService;
use Illuminate\Console\Command;

class SyncSupervisorBackups extends Command
{
    protected $signature = 'backup:sync';
    protected $description = 'Sinkronkan backup supervisor dengan anggota permanen dan periode yang berlaku';

    public function handle(BackupMirrorService $mirror): int
    {
        SupervisorBackupRequest::where('status', 'approved')->whereDate('end_date', '>=', today())
            ->orderBy('id')->each(fn($request) => $mirror->syncForRequest($request));
        $this->info('Relasi backup telah disinkronkan.');
        return self::SUCCESS;
    }
}
