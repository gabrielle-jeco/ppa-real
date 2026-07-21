import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle, Circle, Home, LayoutDashboard, UserCheck, LogOut, Store, X } from 'lucide-react';

type DashboardNotification = {
    id: number;
    type: string;
    title: string;
    message: string;
    description?: string;
    unread: boolean;
};

interface SupervisorLayoutProps {
    children: React.ReactNode;
    activePage: 'dashboard' | 'monitoring' | 'performance';
    onPageChange: (page: 'dashboard' | 'monitoring' | 'performance') => void;
    onLogout: () => void;
}

export default function SupervisorLayout({ children, activePage, onPageChange, onLogout }: SupervisorLayoutProps) {
    const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const unreadCount = notifications.filter((notification) => notification.unread).length;

    const fetchNotifications = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/notifications', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            });
            if (response.ok) {
                const payload = await response.json();
                setNotifications(payload.notifications || []);
            }
        } catch (error) {
            console.error('Gagal mengambil notifikasi', error);
        }
    };

    const markAllRead = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/notifications/read-all', {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            });
            if (response.ok) {
                setNotifications((current) => current.map((notification) => ({ ...notification, unread: false })));
            }
        } catch (error) {
            console.error('Gagal menandai notifikasi', error);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    useEffect(() => {
        if (!isNotificationOpen) return;
        fetchNotifications();

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsNotificationOpen(false);
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isNotificationOpen]);

    return (
        <div className="min-h-screen bg-gray-50 flex font-sans text-gray-800">
            {/* Slim Sidebar */}
            <aside className="w-20 bg-white border-r border-gray-200 fixed h-full flex flex-col items-center py-6 z-20 shadow-sm">

                {/* Logo (Icon Only) */}
                <div className="mb-8 p-3 bg-purple-100 rounded-xl text-primary">
                    <Store size={24} />
                </div>

                {/* Navigation */}
                <nav className="flex-1 w-full px-4 space-y-4">
                    <div className="flex justify-center">
                        <div
                            onClick={() => onPageChange('dashboard')}
                            className={`p-3 rounded-xl cursor-pointer transition hover:scale-105 ${activePage === 'dashboard' ? 'bg-primary text-white shadow-lg shadow-purple-200' : 'text-gray-400 hover:bg-gray-100'}`}
                            title="Dasbor"
                        >
                            <Home size={24} />
                        </div>
                    </div>
                    <div className="flex justify-center">
                        <div
                            onClick={() => onPageChange('monitoring')}
                            className={`p-3 rounded-xl cursor-pointer transition hover:scale-105 ${activePage === 'monitoring' ? 'bg-primary text-white shadow-lg shadow-purple-200' : 'text-gray-400 hover:bg-gray-100'}`}
                            title="Monitoring"
                        >
                            <LayoutDashboard size={24} />
                        </div>
                    </div>
                    <div className="flex justify-center">
                        <div
                            onClick={() => onPageChange('performance')}
                            className={`p-3 rounded-xl cursor-pointer transition hover:scale-105 ${activePage === 'performance' ? 'bg-primary text-white shadow-lg shadow-purple-200' : 'text-gray-400 hover:bg-gray-100'}`}
                            title="Performa Saya"
                        >
                            <UserCheck size={24} />
                        </div>
                    </div>
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={() => setIsNotificationOpen(true)}
                            className={`relative p-3 rounded-xl cursor-pointer transition hover:scale-105 ${isNotificationOpen ? 'bg-primary text-white shadow-lg shadow-purple-200' : 'text-gray-400 hover:bg-gray-100'}`}
                            title="Notifikasi"
                            aria-label={`Notifikasi${unreadCount ? `, ${unreadCount} belum dibaca` : ''}`}
                            aria-expanded={isNotificationOpen}
                            aria-controls="supervisor-notification-drawer"
                        >
                            <Bell size={24} />
                            {unreadCount > 0 && (
                                <span className="absolute -right-1 -top-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </button>
                    </div>
                </nav>

                {/* Logout */}
                <div className="mt-auto px-4 w-full">
                    <button
                        onClick={onLogout}
                        className="w-full flex justify-center p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        title="Keluar"
                    >
                        <LogOut size={24} />
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-20 bg-gray-50 h-screen overflow-hidden flex flex-col">
                {children}
            </main>

            <button
                type="button"
                aria-label="Tutup notifikasi"
                onClick={() => setIsNotificationOpen(false)}
                className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity duration-300 ${isNotificationOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            />

            <aside
                id="supervisor-notification-drawer"
                className={`fixed right-0 top-0 z-50 flex h-full w-96 max-w-[90vw] transform flex-col border-l border-gray-100 bg-white shadow-2xl transition-transform duration-300 ease-out ${isNotificationOpen ? 'translate-x-0' : 'translate-x-full'}`}
                aria-hidden={!isNotificationOpen}
            >
                <div className="flex items-center justify-between border-b border-gray-100 px-7 py-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Pusat Informasi</p>
                        <h2 className="mt-1 text-2xl font-black text-gray-900">Notifikasi</h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsNotificationOpen(false)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                        aria-label="Tutup notifikasi"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex items-center justify-between border-b border-gray-100 px-7 py-4">
                    <p className="text-xs font-semibold text-gray-400">{unreadCount} belum dibaca</p>
                    <button
                        type="button"
                        onClick={markAllRead}
                        disabled={unreadCount === 0}
                        className="text-xs font-bold text-blue-600 transition hover:text-blue-700 disabled:cursor-default disabled:text-gray-300"
                    >
                        Tandai Semua Dibaca
                    </button>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                    {notifications.length === 0 && (
                        <div className="rounded-2xl bg-gray-50 px-5 py-10 text-center text-sm text-gray-400">
                            Belum ada notifikasi.
                        </div>
                    )}

                    {notifications.map((notification) => (
                        <div key={notification.id} className={`flex gap-4 rounded-2xl border p-4 ${notification.unread ? 'border-purple-100 bg-purple-50/60' : 'border-gray-100 bg-white'}`}>
                            <div className="mt-0.5">
                                <CheckCircle size={28} fill="currentColor" className="text-green-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                    <h3 className="font-black text-gray-900">{notification.title}</h3>
                                    {notification.unread ? <Circle size={10} className="mt-1 shrink-0 fill-blue-600 text-blue-600" /> : <Bell size={14} className="mt-1 shrink-0 text-gray-300" />}
                                </div>
                                <p className="mt-2 text-xs font-bold leading-5 text-gray-700">{notification.message}</p>
                                {notification.description && (
                                    <p className="mt-2 text-xs font-semibold leading-5 text-gray-500">{notification.description}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </aside>
        </div>
    );
}
