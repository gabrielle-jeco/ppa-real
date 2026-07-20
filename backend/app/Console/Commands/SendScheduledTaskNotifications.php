<?php

namespace App\Console\Commands;

use App\Models\Task;
use App\Services\UserNotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SendScheduledTaskNotifications extends Command
{
    protected $signature = 'notifications:dispatch-tasks';

    protected $description = 'Send deduplicated reminders for task start, deadline, and approval windows.';

    public function handle(UserNotificationService $notifications): int
    {
        $now = Carbon::now();

        $this->sendStartReminders($notifications, $now);
        $this->sendDeadlineReminders($notifications, $now);
        $this->sendApprovalReminders($notifications, $now);

        return self::SUCCESS;
    }

    private function sendStartReminders(UserNotificationService $notifications, Carbon $now): void
    {
        Task::query()
            ->whereIn('status', ['pending', 'rejected'])
            ->whereNotNull('start_at')
            ->whereBetween('start_at', [$now, $now->copy()->addMinutes(15)])
            ->orderBy('id')
            ->chunkById(200, function ($tasks) use ($notifications) {
                foreach ($tasks as $task) {
                    $notifications->createAndPush(
                        $task->employee_id,
                        'task_start_reminder',
                        'Pekerjaan Segera Dimulai',
                        'Pekerjaan "' . $task->title . '" akan dimulai pada ' . $task->start_at->format('H:i') . '.',
                        'Siapkan diri dan periksa kembali panduan work station Anda.',
                        [
                            'task_id' => $task->id,
                            'url' => '/',
                            'tag' => 'task-start-' . $task->id,
                        ],
                        'task-start-' . $task->id
                    );
                }
            });
    }

    private function sendDeadlineReminders(UserNotificationService $notifications, Carbon $now): void
    {
        Task::query()
            ->whereIn('status', ['pending', 'rejected'])
            ->whereBetween('due_at', [$now, $now->copy()->addMinutes(30)])
            ->where(function ($query) {
                $query->whereDoesntHave('evidences', fn ($evidence) => $evidence->where('type', 'before'))
                    ->orWhereDoesntHave('evidences', fn ($evidence) => $evidence->where('type', 'after'));
            })
            ->orderBy('id')
            ->chunkById(200, function ($tasks) use ($notifications) {
                foreach ($tasks as $task) {
                    $notifications->createAndPush(
                        $task->employee_id,
                        'task_deadline_reminder',
                        'Tenggat Pekerjaan Hampir Habis',
                        'Pekerjaan "' . $task->title . '" harus diselesaikan sebelum ' . $task->due_at->format('H:i') . '.',
                        'Lengkapi bukti pekerjaan sebelum akses unggah dikunci.',
                        [
                            'task_id' => $task->id,
                            'url' => '/',
                            'tag' => 'task-due-' . $task->id,
                        ],
                        'task-due-' . $task->id
                    );
                }
            });
    }

    private function sendApprovalReminders(UserNotificationService $notifications, Carbon $now): void
    {
        $approvalDueFrom = $now->copy()->subHours(24);
        $approvalDueUntil = $now->copy()->subHours(22);

        Task::query()
            ->whereIn('status', ['pending', 'rejected'])
            ->whereBetween('due_at', [$approvalDueFrom, $approvalDueUntil])
            ->whereHas('evidences')
            ->orderBy('id')
            ->chunkById(200, function ($tasks) use ($notifications) {
                foreach ($tasks as $task) {
                    $approvalEndsAt = $task->due_at->copy()->addHours(24);
                    $notifications->createAndPush(
                        $task->employer_id,
                        'approval_deadline_reminder',
                        'Batas Persetujuan Hampir Berakhir',
                        'Persetujuan pekerjaan "' . $task->title . '" akan ditutup pada ' . $approvalEndsAt->format('d/m/Y H:i') . '.',
                        'Periksa bukti pekerjaan dan berikan keputusan sebelum batas waktu berakhir.',
                        [
                            'task_id' => $task->id,
                            'crew_id' => $task->employee_id,
                            'url' => '/',
                            'tag' => 'approval-ending-' . $task->id,
                        ],
                        'approval-ending-' . $task->id
                    );
                }
            });
    }
}
