import React from 'react';
import { Home, LayoutDashboard, UserCheck, LogOut, Store } from 'lucide-react';

interface SupervisorLayoutProps {
    children: React.ReactNode;
    activePage: 'dashboard' | 'monitoring' | 'performance';
    onPageChange: (page: 'dashboard' | 'monitoring' | 'performance') => void;
    onLogout: () => void;
}

export default function SupervisorLayout({ children, activePage, onPageChange, onLogout }: SupervisorLayoutProps) {
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
        </div>
    );
}
