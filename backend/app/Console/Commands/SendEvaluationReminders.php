<?php

namespace App\Console\Commands;

use App\Models\MonthlyPersonalityEvaluation;
use App\Models\ReportingLine;
use App\Models\User;
use App\Services\UserNotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SendEvaluationReminders extends Command
{
    protected $signature = 'notifications:dispatch-evaluations';

    protected $description = 'Remind evaluators during the final seven days of the monthly evaluation window.';

    public function handle(UserNotificationService $notifications): int
    {
        $now = Carbon::now();
        $monthEnd = $now->copy()->endOfMonth()->startOfDay();
        $windowStart = $monthEnd->copy()->subDays(6);

        if ($now->copy()->startOfDay()->lt($windowStart)) {
            return self::SUCCESS;
        }

        $periodKey = $now->format('Y-m');
        $isFinalReminder = $now->copy()->startOfDay()->gte($monthEnd->copy()->subDays(2));

        ReportingLine::query()
            ->where('status', 'active')
            ->select('leader_id')
            ->distinct()
            ->orderBy('leader_id')
            ->chunk(100, function ($lines) use ($notifications, $now, $periodKey, $isFinalReminder) {
                foreach ($lines as $line) {
                    $leader = User::query()
                        ->where('username', $line->leader_id)
                        ->where('active', true)
                        ->with(['accountRole', 'userLocations'])
                        ->first();

                    if (!$leader || !in_array($leader->role_type, ['manager', 'supervisor'], true)) {
                        continue;
                    }

                    $missingCount = $this->missingEvaluationCount($leader, $now);
                    if ($missingCount === 0) {
                        continue;
                    }

                    if ($isFinalReminder) {
                        $notifications->createAndPush(
                            $leader->username,
                            'evaluation_reminder',
                            'Pengingat Terakhir Evaluasi Bulanan',
                            'Masih ada ' . $missingCount . ' evaluasi bawahan yang belum diselesaikan.',
                            'Selesaikan evaluasi sebelum bulan berjalan berakhir dan form dikunci.',
                            [
                                'period' => $periodKey,
                                'url' => '/',
                                'tag' => 'evaluation-final-' . $periodKey,
                            ],
                            'evaluation-final-' . $periodKey
                        );
                    } else {
                        $notifications->createAndPush(
                            $leader->username,
                            'evaluation_reminder',
                            'Evaluasi Bulanan Dibuka',
                            'Terdapat ' . $missingCount . ' evaluasi bawahan yang perlu diisi untuk bulan ini.',
                            'Form evaluasi tersedia selama tujuh hari terakhir bulan berjalan.',
                            [
                                'period' => $periodKey,
                                'url' => '/',
                                'tag' => 'evaluation-open-' . $periodKey,
                            ],
                            'evaluation-open-' . $periodKey
                        );
                    }
                }
            });

        return self::SUCCESS;
    }

    private function missingEvaluationCount(User $leader, Carbon $period): int
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

        $completed = MonthlyPersonalityEvaluation::query()
            ->where('evaluator_id', $leader->username)
            ->whereYear('evaluation_period', $period->year)
            ->whereMonth('evaluation_period', $period->month)
            ->get(['evaluatee_id', 'evaluation_type'])
            ->mapWithKeys(fn ($evaluation) => [
                $evaluation->evaluatee_id . '|' . $evaluation->evaluation_type => true,
            ]);

        return $subordinates->filter(function (User $subordinate) use ($leader, $completed) {
            $evaluationType = $leader->role_type === 'manager' && $subordinate->role_type === 'supervisor'
                ? 'manager_review'
                : 'personality';

            return !$completed->has($subordinate->username . '|' . $evaluationType);
        })->count();
    }
}
