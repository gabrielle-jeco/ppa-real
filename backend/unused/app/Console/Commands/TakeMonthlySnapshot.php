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
    protected $signature = 'score:snapshot {--month=} {--year=}';

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
        $month = $this->option('month') ?: Carbon::now()->month;
        $year = $this->option('year') ?: Carbon::now()->year;

        try {
            $targetDate = Carbon::create($year, $month, 1);
        } catch (\Exception $e) {
            $targetDate = Carbon::now()->startOfMonth();
        }

        $this->info("Taking score snapshot for {$targetDate->format('F Y')}...");

        $users = User::with('jobLevel')->get();

        $crewCount = 0;
        $spvCount = 0;

        foreach ($users as $user) {
            $role = $user->jobLevel ? $user->jobLevel->name : null;

            if ($role === 'crew') {
                // Both calls are needed: scoreData has the 4 scoring components, details has the UI breakdown.
                // They query different data so both are necessary (not redundant).
                $scoreData = $scoringService->getCrewMonthlyScore($user, $targetDate);
                $details = $scoringService->getCrewMonthlyDetailedStats($user, $targetDate);

                // Merge calculation metrics into the view details for archiving
                $mergedDetails = array_merge($details, $scoreData);

                MonthlyOverallScore::updateOrCreate(
                    [
                        'user_id' => $user->id,
                        'period' => $targetDate->toDateString(),
                    ],
                    [
                        'final_score' => $scoreData['total_score'],
                        'details' => $mergedDetails,
                    ]
                );
                $crewCount++;
            } elseif ($role === 'supervisor') {
                $details = $scoringService->getSupervisorMonthlyDetailedScore($user, $targetDate);
                $score = $details['my_avg_point'];

                MonthlyOverallScore::updateOrCreate(
                    [
                        'user_id' => $user->id,
                        'period' => $targetDate->toDateString(),
                    ],
                    [
                        'final_score' => $score,
                        'details' => $details,
                    ]
                );
                $spvCount++;
            }
        }

        $this->info("Snapshot completed! Processed {$crewCount} Crews and {$spvCount} Supervisors.");
        return Command::SUCCESS;
    }
}
