<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\User;
use App\Models\MonthlyOverallScore;
use App\Services\ScoringService;
use Carbon\Carbon;

class TakeMonthlySnapshot extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'score:snapshot {--month=} {--year=} {--previous-month}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Take a monthly snapshot of crew and supervisor scores';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle(ScoringService $scoringService)
    {
        if ($this->option('previous-month')) {
            $targetDate = Carbon::now()->subMonthNoOverflow()->startOfMonth();
        } else {
            $month = $this->option('month') ?: Carbon::now()->month;
            $year = $this->option('year') ?: Carbon::now()->year;

            try {
                $targetDate = Carbon::create($year, $month, 1);
            } catch (\Exception $e) {
                $targetDate = Carbon::now()->startOfMonth();
            }
        }

        $this->info("Taking score snapshot for {$targetDate->format('F Y')}...");

        $crewCount = 0;
        $spvCount = 0;

        User::query()
            ->with(['userLocations', 'accountRole'])
            ->orderBy('id')
            ->chunkById(250, function ($users) use ($scoringService, $targetDate, &$crewCount, &$spvCount) {
                foreach ($users as $user) {
                    $role = $user->role_type;

                    if ($role === 'employee' || $role === 'crew') {
                        $scoreData = $scoringService->getCrewMonthlyScore($user, $targetDate);
                        $details = $scoringService->getCrewMonthlyDetailedStats($user, $targetDate);

                        MonthlyOverallScore::updateOrCreate(
                            [
                                'user_id' => $user->username,
                                'period' => $targetDate->toDateString(),
                            ],
                            [
                                'final_score' => $scoreData['total_score'],
                                'details' => array_merge($details, $scoreData),
                            ]
                        );
                        $crewCount++;
                    } elseif ($role === 'supervisor') {
                        $details = $scoringService->getSupervisorMonthlyDetailedScore($user, $targetDate);

                        MonthlyOverallScore::updateOrCreate(
                            [
                                'user_id' => $user->username,
                                'period' => $targetDate->toDateString(),
                            ],
                            [
                                'final_score' => $details['my_avg_point'],
                                'details' => $details,
                            ]
                        );
                        $spvCount++;
                    }
                }
            });

        $this->info("Snapshot completed! Processed {$crewCount} Crews and {$spvCount} Supervisors.");
        return Command::SUCCESS;
    }
}
