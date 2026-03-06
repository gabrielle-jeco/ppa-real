import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineAlert() {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="fixed top-0 left-0 right-0 bg-red-500 text-white z-[99999] px-4 py-2 flex items-center justify-center gap-2 shadow-md animate-fade-in-down">
            <WifiOff size={16} />
            <span className="text-sm font-bold">You are currently offline. Can't connect to server.</span>
        </div>
    );
}
