import React from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';

interface AdminLayoutProps {
    children: React.ReactNode;
    onLogout: () => void;
}

export default function AdminLayout({ children, onLogout }: AdminLayoutProps) {
    return (
        <div className="min-h-screen bg-gray-50 flex font-sans text-gray-800">
            <aside className="w-20 bg-white border-r border-gray-200 fixed h-full flex flex-col items-center py-6 z-20 shadow-sm">
                <div className="mb-8 p-3 bg-purple-100 rounded-xl text-primary">
                    <ShieldCheck size={24} />
                </div>

                <nav className="flex-1" aria-hidden="true" />

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

            <main className="flex-1 ml-20 bg-gray-50 h-screen overflow-hidden">
                {children}
            </main>
        </div>
    );
}
