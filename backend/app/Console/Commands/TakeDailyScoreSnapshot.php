<?php

namespace App\Console\Commands;

use App\Models\DailyScore;
use App\Models\ScoringRule;
use App\Models\User;
use App\Services\ScoringService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class TakeDailyScoreSnapshot extends Command
{
    protected $signature = 'score:snapshot-daily
        {--date= : Score date in Y-m-d format; defaults to yesterday}
        {--exclude-user=* : Usernames excluded from snapshot due to upstream sync failure}';

    protected $description = 'Store auditable daily scores for active service crew';

    public function handle(ScoringService $scoringService): int
    {
        try {
            $scoreDate = $this->option('date')
                ? Carbon::createFromFormat('Y-m-d', $this->option('date'))->startOfDay()
                : Carbon::now()->subDay()->startOfDay();
        } catch (\Throwable $exception) {
            $this->error('The --date option must use Y-m-d format.');

            return Command::INVALID;
        }

        $rule = ScoringRule::configurationFor($scoreDate);
        $excludedUsers = collect((array) $this->option('exclude-user'))
            ->map(fn ($nik) => trim((string) $nik))
            ->filter(fn ($nik) => $nik !== '')
            ->unique()
            ->values()
            ->all();
        $processed = 0;

        $query = User::query()
            ->where('active', true)
            ->whereHas('userLocations', function ($query) {
                $query->whereRaw('LOWER(TRIM(job_level)) = ?', ['sc']);
            })
            ->with(['userLocations', 'accountRole']);

        if ($excludedUsers !== []) {
            $query->whereNotIn('username', $excludedUsers);
        }

        $query->orderBy('id')
            ->chunkById(250, function ($users) use ($scoringService, $scoreDate, $rule, &$processed) {
                foreach ($users as $user) {
                    $report = $scoringService->getCrewDailyReport($user, $scoreDate, $scoreDate);
                    $row = $report['rows'][0];

                    DailyScore::updateOrCreate(
                        [
                            'user_id' => $user->username,
                            'score_date' => $scoreDate,
                            'category' => 'service_crew',
                        ],
                        [
                            'score' => $row['score'],
                            'available' => $row['available'],
                            'availability_mode' => 'H',
                            'unavailable_reason' => $row['unavailable_reason'],
                            'attendance_status' => $row['attendance_status'],
                            'approved_tasks' => $row['approved_tasks'],
                            'unapproved_tasks' => $row['unapproved_tasks'],
                            'scoring_rule_id' => $rule['id'],
                            'details' => $row,
                        ]
                    );
                    $processed++;
                }
            });

        $this->info("Daily score snapshot completed for {$scoreDate->toDateString()}: {$processed} crew processed.");

        return Command::SUCCESS;
    }
}
