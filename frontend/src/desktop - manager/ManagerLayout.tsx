import React from 'react';
import { LayoutDashboard, LogOut, Store } from 'lucide-react';

interface ManagerLayoutProps {
    user?: any;
    children: React.ReactNode;
    onLogout: () => void;
}

export default function ManagerLayout({ user, children, onLogout }: ManagerLayoutProps) {
    return (
        <div className="min-h-screen bg-gray-100 flex font-sans text-gray-800">
            <aside className="w-20 bg-white border-r border-gray-200 fixed h-full flex flex-col items-center py-6 z-20">
                <div className="mb-8 p-3 bg-gray-100 rounded-xl text-gray-500">
                    <Store size={24} />
                </div>

                <nav className="flex-1 w-full px-4">
                    <div className="flex justify-center">
                        <div
                            className="p-3 rounded-xl bg-gray-800 text-white"
                            title="Dashboard"
                        >
                            <LayoutDashboard size={24} />
                        </div>
                    </div>
                </nav>

                <button
                    onClick={onLogout}
                    className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    title={`Logout ${user?.name || ''}`}
                >
                    <LogOut size={24} />
                </button>
            </aside>

            <main className="flex-1 ml-20 h-screen overflow-hidden">
                {children}
            </main>
        </div>
    );
}
