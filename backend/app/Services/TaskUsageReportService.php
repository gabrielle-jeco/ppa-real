<?php

namespace App\Services;

use App\Models\Location;
use App\Models\Task;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class TaskUsageReportService
{
    public function rows(array $filters): Collection
    {
        $start = Carbon::createFromFormat('Y-m-d', $filters['start_date'])->startOfDay();
        $end = Carbon::createFromFormat('Y-m-d', $filters['end_date'])->endOfDay();
        $locationNames = Location::pluck('name', 'initial');
        $groups = [];
        $seenUsages = [];

        Task::query()
            ->with([
                'createdBy.locations:locations.initial,locations.name',
                'workStation:id,name',
                'taskDefinition:id,task_area_id,title',
                'taskDefinition.taskArea:id,work_station_id,name',
                'taskDefinition.taskArea.workStation:id,name',
            ])
            ->whereNotNull('task_definition_id')
            ->where(function ($query) use ($start, $end) {
                $query->whereBetween('start_at', [$start, $end])
                    ->orWhere(function ($legacy) use ($start, $end) {
                        $legacy->whereNull('start_at')->whereBetween('created_at', [$start, $end]);
                    });
            })
            ->when($filters['location'] ?? null, function ($query, string $location) {
                $query->whereHas('createdBy', function ($creator) use ($location) {
                    $creator->where('initial_store', $location)
                        ->orWhere(function ($fallback) use ($location) {
                            $fallback->where(function ($missingStore) {
                                $missingStore->whereNull('initial_store')->orWhere('initial_store', '');
                            })->whereHas('locations', fn($locations) => $locations->where('locations.initial', $location));
                        });
                });
            })
            ->orderBy('tasks.id')
            ->lazyById(1000)
            ->each(function (Task $task) use (&$groups, &$seenUsages, $locationNames) {
                $usedAt = ($task->start_at ?: $task->created_at)->toDateString();
                $usageKey = $task->assignment_batch_id
                    ? "batch:{$task->assignment_batch_id}:{$usedAt}"
                    : "task:{$task->id}";

                if (isset($seenUsages[$usageKey])) {
                    return;
                }
                $seenUsages[$usageKey] = true;

                $creator = $task->createdBy;
                $location = trim((string) ($creator?->initial_store ?: $creator?->locations?->first()?->initial));
                $area = $task->taskDefinition?->taskArea;
                $station = $area?->workStation ?: $task->workStation;
                $groupKey = implode('|', [
                    $location ?: '-',
                    $station?->id ?: 'legacy',
                    $area?->id ?: 'legacy',
                    $task->task_definition_id,
                ]);

                if (!isset($groups[$groupKey])) {
                    $groups[$groupKey] = [
                        'branch_code' => $location ?: '-',
                        'branch' => $location ? ($locationNames[$location] ?? $location) : 'Cabang tidak diketahui',
                        'category' => $station?->name ?: '-',
                        'area' => $area?->name ?: '-',
                        'task' => $task->taskDefinition?->title ?: $task->title,
                        'usage_count' => 0,
                        'last_used' => $usedAt,
                    ];
                }

                $groups[$groupKey]['usage_count']++;
                if ($usedAt > $groups[$groupKey]['last_used']) {
                    $groups[$groupKey]['last_used'] = $usedAt;
                }
            });

        $sortBy = $filters['sort_by'] ?? 'frequency';
        $direction = $filters['sort_direction'] ?? 'desc';
        $sortField = [
            'frequency' => 'usage_count',
            'category' => 'category',
            'area' => 'area',
            'task' => 'task',
        ][$sortBy];

        return collect(array_values($groups))
            ->sort(function (array $left, array $right) use ($sortField, $direction) {
                $comparison = $sortField === 'usage_count'
                    ? $left[$sortField] <=> $right[$sortField]
                    : strnatcasecmp((string) $left[$sortField], (string) $right[$sortField]);
                if ($comparison === 0) {
                    $comparison = strnatcasecmp(
                        implode('|', [$left['branch_code'], $left['category'], $left['area'], $left['task']]),
                        implode('|', [$right['branch_code'], $right['category'], $right['area'], $right['task']])
                    );
                }

                return $direction === 'desc' ? -$comparison : $comparison;
            })
            ->values();
    }
}
