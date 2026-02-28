import React, { useState } from 'react';
import { LogOut, ChevronDown, CheckSquare, FileText, BarChart2, Users, MapPin, Star } from 'lucide-react';
import MobileLayout from './MobileLayout';

interface DashboardProps {
    onNavigate: (view: any) => void;
    user?: any;
}

const SupervisorDashboardMobile: React.FC<DashboardProps> = ({ onNavigate, user }) => {
    // onNavigate is a prop we'll use to switch 'pages' in this mobile view (Dashboard -> CrewList)

    const PROGRESS_PERCENTAGE = 65; // Mock data
    const YEARLY_SCORE = 98; // Mock data

    const handleLogout = () => {
        // Direct logout without confirmation on mobile as requested
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.reload();
    };

    const getScoreColor = (score: number) => {
        if (score > 90) return 'text-green-500';
        if (score > 75) return 'text-yellow-400';
        return 'text-red-500';
    };

    return (
        <MobileLayout title="Dashboard" allowScroll={true}>
            {/* 1. Identity Card (Crew Style) */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 relative overflow-hidden mb-6">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-xl font-bold">
                            {user?.name?.charAt(0) || 'S'}
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Welcome,</p>
                            <h2 className="text-lg font-bold text-gray-800 leading-tight">
                                {user?.name || 'Supervisor'}
                            </h2>
                        </div>
                    </div>
                    {/* Star Rating */}
                    <div className={`flex flex-col items-center ${getScoreColor(YEARLY_SCORE)}`}>
                        <Star fill="currentColor" size={24} />
                        <span className="text-xs font-bold mt-1">{YEARLY_SCORE}</span>
                    </div>
                </div>

                {/* Location (Locked) */}
                <div className="bg-gray-100 rounded-xl p-3 flex items-center gap-3 text-gray-500">
                    <MapPin size={18} />
                    <span className="text-sm font-semibold uppercase tracking-wide">
                        {user?.locations?.[0]?.name || 'Unknown Location'}
                    </span>
                    <div className="ml-auto bg-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">LOCKED</div>
                </div>
            </div>

            {/* 2. Average Task Progress */}
            <div className="mb-8 mt-2">
                <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                    <div
                        className="bg-gray-400 h-3 rounded-full"
                        style={{ width: `${PROGRESS_PERCENTAGE}%` }}
                    ></div>
                </div>
                <p className="text-center text-xs text-gray-500 font-medium">
                    Average Task Progress : {PROGRESS_PERCENTAGE}%
                </p>
            </div>

            {/* 3. Menu Grid */}
            <div className="grid grid-cols-2 gap-4">
                <MenuCard
                    icon={<CheckSquare size={32} className="text-blue-600" />}
                    label="Checklist"
                    onClick={() => onNavigate('CHECKLIST')}
                />
                <MenuCard
                    icon={<FileText size={32} className="text-blue-600" />}
                    label="Follow Up"
                    onClick={() => { }}
                />
                <MenuCard
                    icon={<BarChart2 size={32} className="text-blue-600" />}
                    label="Report"
                    onClick={() => onNavigate('REPORT')}
                />
                <MenuCard
                    icon={<Users size={32} className="text-blue-600" />}
                    label="Employee"
                    onClick={() => onNavigate('EMPLOYEE_LIST')}
                />
            </div>

            {/* 4. Logout Button (Bottom) */}
            <button
                onClick={handleLogout}
                className="w-full bg-red-50 p-4 rounded-2xl shadow-sm border border-red-100 flex items-center justify-center gap-2 hover:bg-red-100 transition mt-6 group mb-24"
            >
                <LogOut size={20} className="text-red-500 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-red-600">Log Out</span>
            </button>
        </MobileLayout>
    );
};

const MenuCard = ({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) => (
    <button
        onClick={onClick}
        className="bg-gray-100 hover:bg-white hover:shadow-md transition-all rounded-3xl p-6 flex flex-col items-center justify-center gap-3 aspect-square border border-transparent hover:border-gray-100"
    >
        <div className="p-0">{icon}</div>
        <span className="text-blue-600 font-bold text-sm tracking-wide">{label}</span>
    </button>
);

export default SupervisorDashboardMobile;
