export type TaskWithStartTime = {
    start_at?: string | null;
    due_at?: string | null;
    approval_deadline_at?: string | null;
};

export const getTaskStartDate = (task: TaskWithStartTime | null | undefined) => {
    if (!task?.start_at) return null;

    const startAt = new Date(task.start_at);
    return Number.isNaN(startAt.getTime()) ? null : startAt;
};

export const isTaskNotStarted = (
    task: TaskWithStartTime | null | undefined,
    now = new Date(),
) => {
    const startAt = getTaskStartDate(task);
    return startAt ? startAt.getTime() > now.getTime() : false;
};

export const formatTaskStart = (
    task: TaskWithStartTime | null | undefined,
    display: 'time' | 'date-time' = 'time',
) => {
    const startAt = getTaskStartDate(task);
    if (!startAt) return null;

    if (display === 'date-time') {
        return startAt.toLocaleString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    return startAt.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const getTaskApprovalDeadline = (task: TaskWithStartTime | null | undefined) => {
    const value = task?.approval_deadline_at || task?.due_at;
    if (!value) return null;

    const deadline = new Date(value);
    if (Number.isNaN(deadline.getTime())) return null;

    if (!task?.approval_deadline_at) {
        deadline.setHours(23, 59, 59, 999);
    }

    return deadline;
};
