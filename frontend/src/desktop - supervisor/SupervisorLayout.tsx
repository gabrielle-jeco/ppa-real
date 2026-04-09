import React from 'react';
import { House, LayoutGrid, LogOut, UserRoundCog } from 'lucide-react';

interface SupervisorLayoutProps {
    children: React.ReactNode;
    onLogout: () => void;
}

export default function SupervisorLayout({ children, onLogout }: SupervisorLayoutProps) {
    return (
        <div className="min-h-screen bg-[#f6f5fa] flex font-sans text-gray-800">
            <aside className="w-20 bg-[#faf9fd] border-r border-[#dfddea] fixed h-full flex flex-col items-center py-6 z-20">
                <nav className="flex-1 w-full flex flex-col items-center gap-8 pt-2">
                    <div className="w-12 h-12 rounded-2xl bg-[#efe7ff] text-[#8f73d8] flex items-center justify-center">
                        <House size={22} strokeWidth={1.8} />
                    </div>

                    <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-purple-200">
                        <LayoutGrid size={22} strokeWidth={1.8} />
                    </div>

                    <div className="w-12 h-12 rounded-2xl text-[#8d8a99] flex items-center justify-center">
                        <UserRoundCog size={22} strokeWidth={1.8} />
                    </div>
                </nav>

                <div className="mt-auto px-4 w-full">
                    <button
                        onClick={onLogout}
                        className="w-full flex justify-center p-3 text-[#8d8a99] hover:text-red-500 rounded-xl transition-colors"
                        title="Logout"
                    >
                        <LogOut size={24} />
                    </button>
                </div>
            </aside>

            <main className="flex-1 ml-20 bg-[#f6f5fa] h-screen overflow-hidden flex flex-col">
                {children}
            </main>
        </div>
    );
}
