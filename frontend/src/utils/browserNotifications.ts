import { getTaskApprovalDeadline } from './taskTiming';

const hasNotificationSupport = () => typeof window !== 'undefined' && 'Notification' in window;
const webPushPublicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY;

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

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}

export async function registerPushSubscription() {
    if (!hasNotificationSupport() || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!webPushPublicKey) return;

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return;

    try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(webPushPublicKey),
            });
        }

        await fetch('/api/push-subscriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(subscription.toJSON()),
        });
    } catch (error) {
        console.warn('Gagal mendaftarkan push notification.', error);
    }
}

export function notifyUpcomingTask(task: any, prefix = 'crew') {
    if (webPushPublicKey) return;
    if (!task?.task_id || task.status === 'approved') return;

    const dueAt = new Date(task.due_at);
    const remainingMs = dueAt.getTime() - Date.now();
    if (remainingMs <= 0 || remainingMs > 30 * 60 * 1000) return;

    notifyOnce(
        `${prefix}_task_due_${task.task_id}`,
        'Tenggat pekerjaan hampir habis',
        {
            body: `${task.title || 'Pekerjaan'} harus diselesaikan sebelum ${dueAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.`,
            tag: `task-due-${task.task_id}`,
        }
    );
}

export function notifyApprovalGrace(task: any) {
    if (webPushPublicKey) return;
    if (!task?.task_id || task.status === 'approved') return;

    const dueAt = new Date(task.due_at);
    const now = Date.now();
    const approvalDeadline = getTaskApprovalDeadline(task);
    if (!approvalDeadline) return;
    const approvalEndsAt = approvalDeadline.getTime();

    if (now <= dueAt.getTime() || now > approvalEndsAt) return;

    notifyOnce(
        `approval_grace_${task.task_id}`,
        'Persetujuan pekerjaan',
        {
            body: `${task.title || 'Pekerjaan'} sudah melewati tenggat. Persetujuan masih bisa dilakukan sampai ${new Date(approvalEndsAt).toLocaleString('id-ID')}.`,
            tag: `approval-grace-${task.task_id}`,
        }
    );
}
