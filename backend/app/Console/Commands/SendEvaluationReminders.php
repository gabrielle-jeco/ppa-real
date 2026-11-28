<?php

namespace App\Console\Commands;

use App\Models\MonthlyPersonalityEvaluation;
use App\Models\ReportingLine;
use App\Models\User;
use App\Services\UserNotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

class SendEvaluationReminders extends Command
{
    protected $signature = 'notifications:dispatch-evaluations';

    protected $description = 'Remind supervisors (days 1-6) and managers (last 7 days) during active evaluation windows.';

    public function handle(UserNotificationService $notifications): int
    {
        $now = Carbon::now('Asia/Jakarta');
        $today = $now->copy()->startOfDay();
        $monthStart = $now->copy()->startOfMonth();
        $monthEnd = $now->copy()->endOfMonth()->startOfDay();

        // Personality evaluation window: days 1-6 of the current month for the previous month.
        if ($today->betweenIncluded($monthStart, $monthStart->copy()->addDays(5))) {
            $targetPeriod = $now->copy()->subMonthNoOverflow()->startOfMonth();
            $isFinalReminder = $today->day >= 5;

            $this->dispatchWindowReminders(
                $notifications,
                'personality',
                'supervisor',
                $targetPeriod,
                $isFinalReminder
            );
        }

        // Manager review window: last 7 days of the current month for the current month.
        $managerWindowStart = $monthEnd->copy()->subDays(6);
        if ($today->betweenIncluded($managerWindowStart, $monthEnd)) {
            $targetPeriod = $monthStart->copy();
            $isFinalReminder = $today->gte($monthEnd->copy()->subDays(2));

            $this->dispatchWindowReminders(
                $notifications,
                'manager_review',
                'manager',
                $targetPeriod,
                $isFinalReminder
            );
        }

        return self::SUCCESS;
    }

    private function dispatchWindowReminders(
        UserNotificationService $notifications,
        string $evaluationType,
        string $leaderRoleType,
        Carbon $targetPeriod,
        bool $isFinalReminder
    ): void {
        $periodKey = $targetPeriod->format('Y-m');
        $phase = $isFinalReminder ? 'final' : 'open';
        $dedupeKey = "evaluation-{$evaluationType}-{$phase}-{$periodKey}";

        ReportingLine::query()
            ->where('status', 'active')
            ->select('leader_id')
            ->distinct()
            ->orderBy('leader_id')
            ->chunk(100, function ($lines) use ($notifications, $evaluationType, $leaderRoleType, $targetPeriod, $isFinalReminder, $dedupeKey) {
                foreach ($lines as $line) {
                    $leader = User::query()
                        ->where('username', $line->leader_id)
                        ->where('active', true)
                        ->with(['accountRole', 'userLocations'])
                        ->first();

                    if (!$leader || $leader->role_type !== $leaderRoleType) {
                        continue;
                    }

                    $missingCount = $this->missingEvaluationCount($leader, $evaluationType, $targetPeriod);
                    if ($missingCount === 0) {
                        continue;
                    }

                    [$title, $message, $description] = $this->reminderCopy(
                        $evaluationType,
                        $isFinalReminder,
                        $missingCount,
                        $targetPeriod
                    );

                    $notifications->createAndPush(
                        $leader->username,
                        'evaluation_reminder',
                        $title,
                        $message,
                        $description,
                        [
                            'period' => $targetPeriod->format('Y-m'),
                            'evaluation_type' => $evaluationType,
                            'url' => '/',
                            'tag' => $dedupeKey,
                        ],
                        $dedupeKey
                    );
                }
            });
    }

    private function missingEvaluationCount(User $leader, string $evaluationType, Carbon $targetPeriod): int
    {
        $subordinateIds = ReportingLine::query()
            ->where('leader_id', $leader->username)
            ->where('status', 'active')
            ->pluck('subordinate_id')
            ->unique();

        if ($subordinateIds->isEmpty()) {
            return 0;
        }

        $subordinates = User::query()
            ->whereIn('username', $subordinateIds)
            ->where('active', true)
            ->with(['accountRole', 'userLocations'])
            ->get();

        $eligibleSubordinates = $subordinates->filter(function (User $subordinate) use ($evaluationType) {
            if ($evaluationType === 'manager_review') {
                return $subordinate->role_type === 'supervisor';
            }

            return in_array($subordinate->role_type, ['employee', 'crew'], true);
        });

        if ($eligibleSubordinates->isEmpty()) {
            return 0;
        }

        $completedIds = MonthlyPersonalityEvaluation::query()
            ->where('evaluator_id', $leader->username)
            ->where('evaluation_type', $evaluationType)
            ->whereYear('evaluation_period', $targetPeriod->year)
            ->whereMonth('evaluation_period', $targetPeriod->month)
            ->pluck('evaluatee_id')
            ->flip();

        return $eligibleSubordinates
            ->reject(fn (User $subordinate) => $completedIds->has($subordinate->username))
            ->count();
    }

    /**
     * @return array{0: string, 1: string, 2: string}
     */
    private function reminderCopy(
        string $evaluationType,
        bool $isFinalReminder,
        int $missingCount,
        Carbon $targetPeriod
    ): array {
        $periodLabel = $targetPeriod->format('m/Y');

        if ($evaluationType === 'personality') {
            if ($isFinalReminder) {
                return [
                    'Pengingat Terakhir Evaluasi Bulanan',
                    "Masih ada {$missingCount} evaluasi crew periode {$periodLabel} yang belum diselesaikan.",
                    'Selesaikan evaluasi sebelum tanggal 6 berakhir dan form dikunci.',
                ];
            }

            return [
                'Evaluasi Bulanan Dibuka',
                "Terdapat {$missingCount} evaluasi crew periode {$periodLabel} yang perlu diisi.",
                'Form evaluasi sikap kepribadian dibuka pada tanggal 1 sampai 6 bulan berjalan.',
            ];
        }

        if ($isFinalReminder) {
            return [
                'Pengingat Terakhir Penilaian Supervisor',
                "Masih ada {$missingCount} penilaian supervisor periode {$periodLabel} yang belum diselesaikan.",
                'Selesaikan penilaian sebelum bulan berjalan berakhir dan form dikunci.',
            ];
        }

        return [
            'Penilaian Supervisor Dibuka',
            "Terdapat {$missingCount} penilaian supervisor periode {$periodLabel} yang perlu diisi.",
            'Form penilaian supervisor tersedia selama tujuh hari terakhir bulan berjalan.',
        ];
    }
}
