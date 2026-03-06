import React, { useState, useEffect } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import MobileLayout from './MobileLayout';

interface MobileSupervisorReportProps {
    onBack: () => void;
    supervisorId: number; // We might need this, or fetching from auth/user
}

export default function MobileSupervisorReport({ onBack, supervisorId }: MobileSupervisorReportProps) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const getAvailableMonths = (year: number) => {
        if (year === currentYear) {
            return Array.from({ length: currentMonth + 1 }, (_, i) => i);
        }
        return Array.from({ length: 12 }, (_, i) => i);
    };

    const isFutureDate = (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const t = new Date(today);
        t.setHours(0, 0, 0, 0);
        return d > t;
    };

    const getDaysInMonth = () => {
        return new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
    };

    const getFirstDayOfMonth = () => {
        return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay();
    };

    const renderCalendar = () => {
        const daysInMonth = getDaysInMonth();
        const firstDay = getFirstDayOfMonth();
        const days = [];

        // Empty slots
        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8 md:h-9"></div>);

        // Days
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i);
            const isSelected = i === selectedDate.getDate();
            const isFuture = isFutureDate(date);
            const isToday = date.getDate() === today.getDate() &&
                date.getMonth() === today.getMonth() &&
                date.getFullYear() === today.getFullYear();

            // Mock Attendance Coloring
            let attendanceColor = 'bg-gray-100 text-gray-700'; // Default/Future
            if (!isFuture) {
                const hash = (i + selectedDate.getMonth() * 31) % 7;
                // Skew towards present
                if (hash <= 3) attendanceColor = 'bg-green-500 text-white shadow-sm';
                else if (hash === 4) attendanceColor = 'bg-yellow-400 text-white shadow-sm';
                else if (hash === 5) attendanceColor = 'bg-red-500 text-white shadow-sm';
                else attendanceColor = 'bg-gray-300 text-white';
            } else {
                attendanceColor = 'text-gray-300 cursor-not-allowed bg-transparent';
            }

            days.push(
                <button
                    key={i}
                    disabled={true} // Read Only for Report
                    className={`h-8 w-8 rounded-full flex flex-col items-center justify-center text-xs font-bold transition relative ${attendanceColor} ${isToday ? 'ring-2 ring-purple-500 ring-offset-2 z-10' : ''}`}
                >
                    {i}
                </button>
            );
        }
        return days;
    };

    // Mock Data for now, mirroring SupervisorPerformance structure
    // In real app, fetch from /api/supervisor/stats?date=...
    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                const month = selectedDate.getMonth() + 1;
                const year = selectedDate.getFullYear();
                const response = await fetch(`/api/supervisor/stats?month=${month}&year=${year}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setStats(data);
                }
            } catch (error) {
                console.error("Failed to fetch supervisor report stats", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [selectedDate]);

    // Calendar Handlers (Reuse logic)
    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(parseInt(e.target.value));
        setSelectedDate(newDate);
    };

    const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDate = new Date(selectedDate);
        newDate.setFullYear(parseInt(e.target.value));
        setSelectedDate(newDate);
    };

    return (
        <MobileLayout
            title="Performance Report"
            onBack={onBack}
        >
            <div className="flex flex-col gap-4 pb-6">

                {/* 1. Month/Year Selector (Pill Style) */}
                <div className="bg-white rounded-3xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 w-full">
                        <div className="relative group flex-1">
                            <select
                                value={selectedDate.getMonth()}
                                onChange={handleMonthChange}
                                className="w-full appearance-none bg-gray-50 border border-transparent hover:border-blue-100 rounded-xl px-3 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors"
                            >
                                {getAvailableMonths(selectedDate.getFullYear()).map(i => (
                                    <option key={i} value={i}>
                                        {new Date(0, i).toLocaleString('en-US', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-blue-600 transition-colors" />
                        </div>

                        <div className="relative group w-24">
                            <select
                                value={selectedDate.getFullYear()}
                                onChange={handleYearChange}
                                className="w-full appearance-none bg-gray-50 border border-transparent hover:border-blue-100 rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                            >
                                {Array.from({ length: new Date().getFullYear() - 2024 + 1 }, (_, i) => 2024 + i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-blue-600 transition-colors" />
                        </div>
                    </div>
                </div>

                {/* 1.5. Attendance Calendar Grid */}
                <div className="bg-white rounded-3xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-800 mb-4">Attendance History</h3>
                    <div className="grid grid-cols-7 text-center mb-2 border-b border-gray-100 pb-2">
                        {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(day => (
                            <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1 justify-items-center">
                        {renderCalendar()}
                    </div>
                </div>

                {/* 2. My AVG Point */}
                <div className="bg-white p-5 rounded-3xl shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xs font-bold text-gray-600">My AVG Point</h3>
                        <span className="text-sm font-bold text-gray-800">{stats?.my_avg_point || 0}%</span>
                    </div>
                    <div className="w-full bg-purple-50 rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full transition-all duration-1000" style={{ width: `${stats?.my_avg_point || 0}%` }}></div>
                    </div>
                </div>

                {/* 3. Task Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Task for SC */}
                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                        <h3 className="text-xs font-bold text-gray-600 mb-3">Task for SC</h3>
                        <div className="w-full bg-purple-50 rounded-full h-3 overflow-hidden mb-1">
                            <div className="h-full bg-red-500 rounded-full transition-all duration-1000" style={{ width: `${stats?.task_for_sc?.completed || 0}%` }}></div>
                        </div>
                        <p className="text-[10px] text-gray-400">{stats?.task_for_sc?.completed || 0}% Completed</p>
                    </div>

                    {/* Task Completed From SM/RM */}
                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                        <h3 className="text-xs font-bold text-gray-600 mb-3">Task Completed From SM/RM</h3>
                        <div className="w-full bg-purple-50 rounded-full h-3 overflow-hidden mb-1">
                            <div className="h-full bg-red-500 rounded-full transition-all duration-1000" style={{ width: `${stats?.task_from_manager?.completed || 0}%` }}></div>
                        </div>
                        <p className="text-[10px] text-gray-400">{stats?.task_from_manager?.completed || 0}%</p>
                    </div>
                </div>

                {/* 4. Monthly Stats Grid (Grey Box Style) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Task Given */}
                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                        <h3 className="text-xs font-bold text-gray-600 mb-3">Task Given (Monthly)</h3>
                        <div className="bg-gray-200 rounded-xl py-3 px-4 text-center">
                            <span className="font-bold text-gray-700 text-sm">{stats?.monthly_task_given || '0/0 People'}</span>
                        </div>
                    </div>

                    {/* AVG Service Point */}
                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                        <h3 className="text-xs font-bold text-gray-600 mb-3">AVG Service Crew Point</h3>
                        <div className="bg-gray-200 rounded-xl py-3 px-4 text-center">
                            <span className="font-bold text-gray-700 text-sm">{stats?.avg_service_crew_point || 0}%</span>
                        </div>
                    </div>
                </div>

            </div>
        </MobileLayout>
    );
}
