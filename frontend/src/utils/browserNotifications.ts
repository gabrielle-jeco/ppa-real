const hasNotificationSupport = () => typeof window !== 'undefined' && 'Notification' in window;

export async function requestNotificationPermission() {
    if (!hasNotificationSupport()) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;

    return Notification.requestPermission();
}

export function notifyOnce(key: string, title: string, options?: NotificationOptions) {
    if (!hasNotificationSupport() || Notification.permission !== 'granted') return;

    const storageKey = `yodaily_notification_${key}`;
    if (localStorage.getItem(storageKey)) return;

    localStorage.setItem(storageKey, new Date().toISOString());
    new Notification(title, {
        icon: '/apple-touch-icon.png',
        badge: '/favicon-16x16.png',
        ...options,
    });
}

export function markNotificationSeen(key: string) {
    localStorage.setItem(`yodaily_notification_${key}`, new Date().toISOString());
}

export function notifyUpcomingTask(task: any, prefix = 'crew') {
    if (!task?.task_id || task.status === 'approved') return;

    const dueAt = new Date(task.due_at);
    const remainingMs = dueAt.getTime() - Date.now();
    if (remainingMs <= 0 || remainingMs > 30 * 60 * 1000) return;

    notifyOnce(
        `${prefix}_task_due_${task.task_id}`,
        'Tenggat tugas hampir habis',
        {
            body: `${task.title || 'Tugas'} harus diselesaikan sebelum ${dueAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
            tag: `task-due-${task.task_id}`,
        }
    );
}

export function notifyApprovalGrace(task: any) {
    if (!task?.task_id || task.status === 'approved') return;

    const dueAt = new Date(task.due_at);
    const now = Date.now();
    const approvalEndsAt = dueAt.getTime() + 24 * 60 * 60 * 1000;

    if (now <= dueAt.getTime() || now > approvalEndsAt) return;

    notifyOnce(
        `approval_grace_${task.task_id}`,
        'Tugas menunggu approval',
        {
            body: `${task.title || 'Tugas'} sudah melewati tenggat. Approval masih bisa dilakukan sampai ${new Date(approvalEndsAt).toLocaleString()}.`,
            tag: `approval-grace-${task.task_id}`,
        }
    );
}
