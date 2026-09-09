import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';

const SYNC_INTERVAL_MS = 60_000;

export default function ServerClock() {
    const [display, setDisplay] = useState('Menyinkronkan...');
    const [unavailable, setUnavailable] = useState(false);

    useEffect(() => {
        let disposed = false;
        let pending: AbortController | null = null;
        let anchor: { epoch: number; receivedAt: number; formatter: Intl.DateTimeFormat } | null = null;

        const tick = () => {
            if (!anchor || document.hidden || disposed) return;
            // Use elapsed monotonic time, not the laptop's wall clock.
            setDisplay(anchor.formatter.format(anchor.epoch + performance.now() - anchor.receivedAt));
        };

        const synchronize = async () => {
            if (document.hidden || pending || disposed) return;
            const controller = new AbortController();
            pending = controller;
            const timeout = window.setTimeout(() => controller.abort(), 10_000);
            const sentAt = performance.now();

            try {
                const response = await fetch('/api/cms/server-time', {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                        Accept: 'application/json',
                    },
                    cache: 'no-store',
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error('Server time unavailable');
                const payload = await response.json();
                const receivedAt = performance.now();
                const epoch = typeof payload.server_time === 'string' ? Date.parse(payload.server_time) : NaN;
                if (!Number.isFinite(epoch) || typeof payload.timezone !== 'string') {
                    throw new Error('Invalid server time');
                }
                const formatter = new Intl.DateTimeFormat('id-ID', {
                    timeZone: payload.timezone,
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hourCycle: 'h23',
                    timeZoneName: 'short',
                });
                if (disposed) return;
                // Half the round trip approximates response travel time.
                anchor = { epoch: epoch + (receivedAt - sentAt) / 2, receivedAt, formatter };
                setUnavailable(false);
                tick();
            } catch {
                if (!disposed) {
                    anchor = null;
                    setUnavailable(true);
                    setDisplay('Tidak tersinkron');
                }
            } finally {
                window.clearTimeout(timeout);
                pending = null;
            }
        };

        const resume = () => { void synchronize(); };
        resume();
        const ticker = window.setInterval(tick, 1_000);
        const syncTimer = window.setInterval(resume, SYNC_INTERVAL_MS);
        document.addEventListener('visibilitychange', resume);
        window.addEventListener('focus', resume);
        window.addEventListener('online', resume);

        return () => {
            disposed = true;
            pending?.abort();
            window.clearInterval(ticker);
            window.clearInterval(syncTimer);
            document.removeEventListener('visibilitychange', resume);
            window.removeEventListener('focus', resume);
            window.removeEventListener('online', resume);
        };
    }, []);

    return (
        <div className="flex items-center gap-2 border-r border-gray-200 pr-4 text-sm"
            title="Waktu Laravel, disinkronkan setiap menit dan saat kembali ke tab. Tampilan merupakan perkiraan waktu server."
        >
            <Clock3 size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
            <div>
                <p className="text-xs text-gray-400">Waktu Server</p>
                <p className={`whitespace-nowrap font-medium tabular-nums ${unavailable ? 'text-amber-600' : 'text-gray-600'}`}>
                    {display}
                </p>
            </div>
        </div>
    );
}
