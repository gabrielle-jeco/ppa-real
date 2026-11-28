<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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
    protected $signature = 'score:snapshot {--month=} {--year=} {--previous-month} {--exclude-user=*}';

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
                $targetDate = Carbon::create($year, $month, 1)->startOfMonth();
            } catch (\Exception $e) {
                $targetDate = Carbon::now()->startOfMonth();
            }
        }

        $startOfMonth = $targetDate->copy()->startOfMonth();
        $endOfMonth = $targetDate->copy()->endOfMonth();
        $excludedUsers = collect((array) $this->option('exclude-user'))
            ->map(fn ($nik) => trim((string) $nik))
            ->filter(fn ($nik) => $nik !== '')
            ->unique()
            ->values()
            ->all();

        $this->info("Taking score snapshot for {$targetDate->format('F Y')}...");

        $crewCount = 0;
        $spvCount = 0;

        $hasAttendances = Schema::hasTable('attendances');
        $hasTasks = Schema::hasTable('tasks');
        $hasEvaluations = Schema::hasTable('monthly_personality_evaluations');

        $query = User::query()
            ->with(['userLocations', 'accountRole'])
            ->where(function ($scope) use ($startOfMonth, $endOfMonth, $hasAttendances, $hasTasks, $hasEvaluations) {
                $scope->where('active', true);

                if ($hasAttendances || $hasTasks || $hasEvaluations) {
                    $scope->orWhere(function ($inactiveWithActivity) use ($startOfMonth, $endOfMonth, $hasAttendances, $hasTasks, $hasEvaluations) {
                        $inactiveWithActivity->where('active', false)
                            ->where(function ($activity) use ($startOfMonth, $endOfMonth, $hasAttendances, $hasTasks, $hasEvaluations) {
                                $hasClause = false;

                                if ($hasAttendances) {
                                    $activity->whereExists(function ($sub) use ($startOfMonth, $endOfMonth) {
                                        $sub->select(DB::raw(1))
                                            ->from('attendances')
                                            ->whereColumn('attendances.user_id', 'users.username')
                                            ->whereBetween('attendances.date', [
                                                $startOfMonth->toDateString(),
                                                $endOfMonth->toDateString(),
                                            ]);
                                    });
                                    $hasClause = true;
                                }

                                if ($hasTasks) {
                                    $method = $hasClause ? 'orWhereExists' : 'whereExists';
                                    $activity->{$method}(function ($sub) use ($startOfMonth, $endOfMonth) {
                                        $sub->select(DB::raw(1))
                                            ->from('tasks')
                                            ->where(function ($userMatch) {
                                                $userMatch->whereColumn('tasks.employee_id', 'users.username')
                                                    ->orWhereColumn('tasks.employer_id', 'users.username');
                                            })
                                            ->whereBetween('tasks.due_at', [
                                                $startOfMonth->copy()->startOfDay()->toDateTimeString(),
                                                $endOfMonth->copy()->endOfDay()->toDateTimeString(),
                                            ]);
                                    });
                                    $hasClause = true;
                                }

                                if ($hasEvaluations) {
                                    $method = $hasClause ? 'orWhereExists' : 'whereExists';
                                    $activity->{$method}(function ($sub) use ($startOfMonth, $endOfMonth) {
                                        $sub->select(DB::raw(1))
                                            ->from('monthly_personality_evaluations')
                                            ->where(function ($userMatch) {
                                                $userMatch->whereColumn('monthly_personality_evaluations.evaluatee_id', 'users.username')
                                                    ->orWhereColumn('monthly_personality_evaluations.evaluator_id', 'users.username');
                                            })
                                            ->whereBetween('monthly_personality_evaluations.evaluation_period', [
                                                $startOfMonth->toDateString(),
                                                $endOfMonth->toDateString(),
                                            ]);
                                    });
                                }
                            });
                    });
                }
            });

        if ($excludedUsers !== []) {
            $query->whereNotIn('username', $excludedUsers);
        }

        $query->orderBy('id')
            ->chunkById(250, function ($users) use ($scoringService, $targetDate, &$crewCount, &$spvCount) {
                foreach ($users as $user) {
                    $role = $user->role_type;

                    if ($role === 'employee' || $role === 'crew') {
                        $scoringService->refreshCrewMonthlySnapshot($user, $targetDate);
                        $crewCount++;
                    } elseif ($role === 'supervisor') {
                        $details = $scoringService->getSupervisorMonthlyDetailedScore($user, $targetDate);

                        $scoringService->upsertMonthlyOverallScore(
                            $user->username,
                            $targetDate,
                            (int) $details['my_avg_point'],
                            $details
                        );
                        $spvCount++;
                    }
                }
            });

        $this->info("Snapshot completed! Processed {$crewCount} Crews and {$spvCount} Supervisors.");
        return Command::SUCCESS;
    }
}
