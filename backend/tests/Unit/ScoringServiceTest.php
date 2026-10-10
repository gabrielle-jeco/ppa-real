<?php

namespace Tests\Unit;

use App\Models\Task;
use App\Models\TaskEvidence;
use App\Services\ScoringService;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class ScoringServiceTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * @dataProvider monthlyFormulaProvider
     */
    public function test_monthly_formula_uses_60_25_15_weights(
        float $taskScore,
        float $attendanceScore,
        float $personalityScore,
        int $expected
    ): void {
        $this->assertSame(
            $expected,
            $this->invokePrivate(
                new ScoringService(),
                'calculateCrewMonthlyTotal',
                [$taskScore, $attendanceScore, $personalityScore]
            )
        );
    }

    public function monthlyFormulaProvider(): array
    {
        return [
            'all perfect' => [100, 100, 100, 100],
            'task only' => [100, 0, 0, 60],
            'attendance only' => [0, 100, 0, 25],
            'questionnaire only' => [0, 0, 100, 15],
            'weighted result rounds once' => [66.67, 80, 90, 74],
        ];
    }

    /**
     * @dataProvider taskPhotoFormulaProvider
     */
    public function test_task_photo_formula_is_unchanged(
        string $status,
        array $evidenceTypes,
        float $expected
    ): void {
        $task = new Task(['status' => $status]);
        $task->setRelation(
            'evidences',
            new Collection(array_map(
                fn (string $type) => new TaskEvidence(['type' => $type]),
                $evidenceTypes
            ))
        );

        $this->assertSame(
            $expected,
            $this->invokePrivate(new ScoringService(), 'getTaskScore', [$task])
        );
    }

    public function taskPhotoFormulaProvider(): array
    {
        return [
            'not submitted' => ['pending', [], 0.0],
            'approved without evidence' => ['approved', [], 0.0],
            'before only' => ['approved', ['before'], 50.0],
            'after only' => ['approved', ['after'], 50.0],
            'before and after' => ['approved', ['before', 'after'], 100.0],
            'two of three' => ['approved', ['before', 'after', 'after'], 66.67],
            'two of four' => ['approved', ['before', 'after', 'after', 'after'], 50.0],
            'same evidence type stays partial' => ['approved', ['after', 'after'], 50.0],
        ];
    }

    public function test_revision_workflow_scores_the_approved_attempt_and_requires_before_evidence(): void
    {
        $approvedTask = new Task();
        $approvedTask->setRawAttributes([
            'status' => 'approved',
            'revision_deadline_at' => '2026-10-09 23:29:59',
        ], true);
        $approvedTask->setRelation('evidences', new Collection([
            new TaskEvidence(['type' => 'before']),
            new TaskEvidence([
                'type' => 'after',
                'attempt_no' => 1,
                'review_status' => 'rejected',
                'awarded_score' => 0,
            ]),
            new TaskEvidence([
                'type' => 'after',
                'attempt_no' => 2,
                'review_status' => 'approved',
                'awarded_score' => 67,
            ]),
        ]));

        $withoutBefore = clone $approvedTask;
        $withoutBefore->setRelation('evidences', $approvedTask->evidences->where('type', 'after')->values());

        $service = new ScoringService();
        $this->assertSame(67.0, $this->invokePrivate($service, 'getTaskScore', [$approvedTask]));
        $this->assertSame(0.0, $this->invokePrivate($service, 'getTaskScore', [$withoutBefore]));
    }

    /**
     * @dataProvider completedMonthProvider
     */
    public function test_completed_month_range_uses_every_calendar_day(
        string $month,
        int $expectedDays
    ): void {
        Carbon::setTestNow(Carbon::parse('2030-01-15 12:00:00', 'Asia/Jakarta'));

        [$start, $end] = $this->invokePrivate(
            new ScoringService(),
            'getScoringRangeForMonth',
            [Carbon::parse($month, 'Asia/Jakarta')]
        );

        $this->assertSame(
            $expectedDays,
            $start->copy()->startOfDay()->diffInDays($end->copy()->startOfDay()) + 1
        );
    }

    public function completedMonthProvider(): array
    {
        return [
            'regular February' => ['2027-02-01', 28],
            'leap February' => ['2028-02-01', 29],
            'thirty-day month' => ['2029-04-01', 30],
            'thirty-one-day month' => ['2029-01-01', 31],
        ];
    }

    public function test_current_month_range_stops_at_today(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-12 10:00:00', 'Asia/Jakarta'));

        [$start, $end] = $this->invokePrivate(
            new ScoringService(),
            'getScoringRangeForMonth',
            [Carbon::parse('2026-09-01', 'Asia/Jakarta')]
        );

        $this->assertSame('2026-09-01', $start->toDateString());
        $this->assertSame('2026-09-12', $end->toDateString());
    }

    public function test_attendance_score_uses_configured_statuses_and_target_with_a_cap(): void
    {
        $service = new ScoringService();

        $this->assertSame(60.0, $service->calculateAttendanceScore(
            ['H', 'O', 'A', 'CT'],
            ['H', 'O', 'OP', 'CT'],
            5
        ));
        $this->assertSame(100.0, $service->calculateAttendanceScore(
            array_fill(0, 30, 'H'),
            ['H'],
            25
        ));
    }

    /**
     * @dataProvider ibopProvider
     */
    public function test_ibop_bands(int $quantity, int $expected): void
    {
        $this->assertSame($expected, (new ScoringService())->calculateIbopScore($quantity));
    }

    public function ibopProvider(): array
    {
        return [
            'zero' => [0, 0],
            'minimum points' => [1, 20],
            'middle threshold' => [15000, 70],
            'maximum threshold' => [30000, 100],
        ];
    }

    /**
     * @dataProvider pushSellingProvider
     */
    public function test_push_selling_bands(int $quantity, int $expected): void
    {
        $this->assertSame($expected, (new ScoringService())->calculatePushSellingScore($quantity));
    }

    public function pushSellingProvider(): array
    {
        return [
            'actual zero still scores forty' => [0, 40],
            'second band' => [100, 50],
            'excellent' => [1000, 95],
            'maximum target' => [1250, 100],
        ];
    }

    public function test_cashier_score_requires_all_sources_and_uses_configured_weights(): void
    {
        $service = new ScoringService();
        $rule = [
            'cashier_task_weight' => 50,
            'cashier_ibop_weight' => 25,
            'cashier_push_selling_weight' => 25,
        ];

        $this->assertSame(82.5, $service->calculateCashierTaskScore(90, 80, 70, $rule));
        $this->assertNull($service->calculateCashierTaskScore(90, null, 70, $rule));
    }

    public function test_yearly_score_counts_only_completed_months(): void
    {
        $service = new ScoringService();

        $this->assertSame(8, $this->invokePrivate($service, 'completedMonthsInYear', [2026, 2026, 9]));
        $this->assertSame(0, $this->invokePrivate($service, 'completedMonthsInYear', [2026, 2026, 1]));
        $this->assertSame(12, $this->invokePrivate($service, 'completedMonthsInYear', [2025, 2026, 9]));
    }

    private function invokePrivate(object $object, string $method, array $arguments): mixed
    {
        $reflection = new ReflectionMethod($object, $method);
        $reflection->setAccessible(true);

        return $reflection->invokeArgs($object, $arguments);
    }
}
