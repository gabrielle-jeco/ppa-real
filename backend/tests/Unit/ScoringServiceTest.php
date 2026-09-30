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

    private function invokePrivate(object $object, string $method, array $arguments): mixed
    {
        $reflection = new ReflectionMethod($object, $method);
        $reflection->setAccessible(true);

        return $reflection->invokeArgs($object, $arguments);
    }
}
