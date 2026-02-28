import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// Define the BeforeInstallPromptEvent interface
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setIsVisible(false);
        }
        setDeferredPrompt(null);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[9999] animate-fade-in-up">
            <div className={`${isMobile ? 'bg-blue-600' : 'bg-primary'} text-white p-4 rounded-2xl shadow-xl flex items-center justify-between gap-4 transition-colors`}>
                <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-xl">
                        <Download size={24} />
                    </div>
                    <div>
                        <h4 className="font-bold text-sm">Install App</h4>
                        <p className="text-xs text-blue-100">Add to Home Screen for better experience.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsVisible(false)}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                    <button
                        onClick={handleInstallClick}
                        className={`bg-white ${isMobile ? 'text-blue-600 hover:bg-blue-50' : 'text-primary hover:bg-purple-50'} px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm`}
                    >
                        Install
                    </button>
                </div>
            </div>
        </div>
    );
}
