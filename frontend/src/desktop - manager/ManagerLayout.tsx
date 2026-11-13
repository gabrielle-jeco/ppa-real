import React from 'react';
import { GitBranch, LayoutDashboard, LogOut, Store } from 'lucide-react';

interface ManagerLayoutProps {
    children: React.ReactNode;
    user?: any;
    activePage: 'dashboard' | 'organization';
    onPageChange: (page: 'dashboard' | 'organization') => void;
    onLogout: () => void;
}

export default function ManagerLayout({ children, activePage, onPageChange, onLogout }: ManagerLayoutProps) {
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
                        <button type="button" onClick={() => onPageChange('dashboard')} title="Karyawan" className={`p-3 rounded-xl cursor-pointer transition hover:scale-105 ${activePage === 'dashboard' ? 'bg-primary text-white shadow-lg shadow-purple-200' : 'text-gray-400 hover:bg-purple-50 hover:text-primary'}`}>
                            <LayoutDashboard size={24} />
                        </button>
                    </div>
                    <div className="flex justify-center">
                        <button type="button" onClick={() => onPageChange('organization')} title="Organigram" className={`p-3 rounded-xl cursor-pointer transition hover:scale-105 ${activePage === 'organization' ? 'bg-primary text-white shadow-lg shadow-purple-200' : 'text-gray-400 hover:bg-purple-50 hover:text-primary'}`}>
                            <GitBranch size={24} />
                        </button>
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
