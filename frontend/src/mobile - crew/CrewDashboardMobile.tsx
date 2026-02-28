import React, { useState } from 'react';
import { MapPin, Users, BookOpen, CheckCircle, Calendar, Star, ChevronDown, LogOut } from 'lucide-react';
import CrewLayout from './CrewLayout';

interface CrewDashboardProps {
    user: any;
    onNavigate: (page: 'history' | 'evaluation' | 'task-list' | 'guide') => void;
    selectedRole: string;
    onRoleChange: (role: string) => void;
    onLogout?: () => void;
}

const ROLES = [
    { id: 'cashier', label: 'Crew - Cashier' },
    { id: 'supermarket', label: 'Crew - Supermarket' },
    { id: 'fresh', label: 'Crew - Fresh' },
    { id: 'fashion', label: 'Crew - Fashion' }
];

export default function CrewDashboardMobile({ user, onNavigate, selectedRole, onRoleChange, onLogout }: CrewDashboardProps) {
    // Removed local state: const [selectedRole, setSelectedRole] = useState(ROLES[0].id);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isGuideRead, setIsGuideRead] = useState(false);

    // Mock Data
    const yearlyScore = 97;
    const taskProgress = { completed: 5, total: 8 };
    const progressPercent = (taskProgress.completed / taskProgress.total) * 100;

    // Helper for Star Color
    const getScoreColor = (score: number) => {
        if (score > 90) return 'text-green-500';
        if (score > 75) return 'text-yellow-400';
        return 'text-red-500';
    };

    return (
        <CrewLayout title="Dashboard" showBack={false}>
            <div className="space-y-6 pb-24">
                {/* 1. Identity Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-xl font-bold">
                                {user?.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Welcome,</p>
                                <h2 className="text-lg font-bold text-gray-800 leading-tight">
                                    {user?.name || 'Crew Member'}!
                                </h2>
                            </div>
                        </div>
                        {/* Star Rating */}
                        <div className={`flex flex-col items-center ${getScoreColor(yearlyScore)}`}>
                            <Star fill="currentColor" size={24} />
                            <span className="text-xs font-bold mt-1">{yearlyScore}</span>
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

                {/* 2. Today's Role & Task Progress */}
                <div className="bg-blue-600 rounded-3xl pt-4 px-3 pb-3 text-white shadow-lg shadow-blue-200 relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-4 px-1">
                            <p className="text-xs font-bold text-blue-200 tracking-wide uppercase">Today, {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>

                        {/* Main White Card Container */}
                        <div className="bg-white rounded-2xl p-5 text-gray-800 shadow-sm relative">

                            {/* Section 1: Role */}
                            <div className="mb-6 relative">
                                <div className="flex justify-between items-end mb-2">
                                    <label className="text-xs font-semibold text-gray-500">Your Role as</label>
                                    <button
                                        onClick={() => onNavigate('guide')}
                                        className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md shadow-blue-200 active:scale-95 transition-transform hover:bg-blue-700"
                                    >
                                        View Guide !
                                    </button>
                                </div>
                                <div className="relative">
                                    <select
                                        value={selectedRole}
                                        onChange={(e) => onRoleChange(e.target.value)}
                                        className="w-full appearance-none bg-gray-100 text-gray-800 font-bold py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 border border-transparent focus:bg-white transition-colors"
                                    >
                                        {ROLES.map(role => (
                                            <option key={role.id} value={role.id}>{role.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                                </div>
                            </div>

                            {/* Divider (Optional, but helps separation) */}
                            {/* <div className="h-px bg-gray-100 my-4"></div> */}

                            {/* Section 2: Task Progress */}
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Task Completed</p>
                                        <p className="text-3xl font-extrabold text-blue-900 leading-none">{taskProgress.completed}/{taskProgress.total}</p>
                                    </div>
                                    <button
                                        onClick={() => onNavigate('task-list')}
                                        className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md shadow-blue-200 active:scale-95 transition-transform hover:bg-blue-700"
                                    >
                                        View Task !
                                    </button>
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full bg-gray-100 rounded-full h-3 mt-1">
                                    <div
                                        className="bg-blue-500 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                                        style={{ width: `${progressPercent}%` }}
                                    >
                                        <div className="absolute inset-0 bg-white/30 w-full h-full animate-[shimmer_2s_infinite]"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Decor */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full blur-xl -ml-10 -mb-5"></div>
                </div>

                {/* 3. Menu Grid */}
                <div className="grid grid-cols-1 gap-4">
                    <button className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between hover:bg-gray-50 transition group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                                <Users size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-gray-800">Report</h3>
                                <p className="text-xs text-gray-400">View analytics</p>
                            </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                            <ChevronDown size={16} className="-rotate-90" />
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('evaluation')}
                        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between hover:bg-gray-50 transition group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center text-yellow-600 group-hover:scale-110 transition-transform">
                                <Star size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-gray-800">Evaluation</h3>
                                <p className="text-xs text-gray-400">Check your scores</p>
                            </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                            <ChevronDown size={16} className="-rotate-90" />
                        </div>
                    </button>

                    <button
                        onClick={() => onNavigate('history')}
                        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between hover:bg-gray-50 transition group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                                <Calendar size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-gray-800">History</h3>
                                <p className="text-xs text-gray-400">Past activities</p>
                            </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                            <ChevronDown size={16} className="-rotate-90" />
                        </div>
                    </button>

                    {/* Logout Button */}
                    <button
                        onClick={onLogout}
                        className="bg-red-50 p-4 rounded-2xl shadow-sm border border-red-100 flex items-center justify-center gap-2 hover:bg-red-100 transition mt-4 group"
                    >
                        <LogOut size={20} className="text-red-500 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-red-600">Log Out</span>
                    </button>
                </div>
            </div>
        </CrewLayout>
    );
}
