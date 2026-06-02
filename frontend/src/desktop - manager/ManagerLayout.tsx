import React from 'react';
import { LayoutDashboard, LogOut, Store } from 'lucide-react';

interface ManagerLayoutProps {
    children: React.ReactNode;
    user?: any;
    onLogout: () => void;
}

export default function ManagerLayout({ children, onLogout }: ManagerLayoutProps) {
    return (
        <div className="min-h-screen bg-gray-50 flex font-sans text-gray-800">
            {/* Slim Sidebar */}
            <aside className="w-20 bg-white border-r border-gray-200 fixed h-full flex flex-col items-center py-6 z-20 shadow-sm">

                {/* Logo (Icon Only) */}
                <div className="mb-8 p-3 bg-purple-100 rounded-xl text-primary">
                    <Store size={24} />
                </div>

                {/* Navigation (Dashboard Only) */}
                <nav className="flex-1 w-full px-4 space-y-4">
                    <div className="flex justify-center">
                        <div className="p-3 bg-primary text-white rounded-xl shadow-lg shadow-purple-200 cursor-pointer transition hover:scale-105">
                            <LayoutDashboard size={24} />
                        </div>
                    </div>
                </nav>

                {/* Logout */}
                <div className="mt-auto px-4 w-full">
                    <button
                        onClick={onLogout}
                        className="w-full flex justify-center p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        title="Logout"
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
