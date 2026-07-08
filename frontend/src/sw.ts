/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<unknown>;
};

clientsClaim();
self.skipWaiting();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
    let payload: any = {};

    try {
        payload = event.data?.json() || {};
    } catch {
        payload = { body: event.data?.text() };
    }

    const title = payload.title || 'Aplikasi YODAILY';
    const options: NotificationOptions = {
        body: payload.body || 'Ada pembaruan pekerjaan di YoDaily.',
        icon: '/apple-touch-icon.png',
        badge: '/favicon-16x16.png',
        tag: payload.tag || 'yodaily',
        data: {
            url: payload.url || '/',
        },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    return client.focus();
                }
            }

            return self.clients.openWindow(targetUrl);
        })
    );
});
