import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import CrewLayout from './CrewLayout';

interface MobileCrewEvaluationProps {
    onBack: () => void;
    user?: any;
}

export default function MobileCrewEvaluation({ onBack, user }: MobileCrewEvaluationProps) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [stats, setStats] = useState<any>({
        yearly_score: 0,
        monthly_score: 0,
        active_percentage: 0,
        personality_score: 0,
        activity_monitor: []
    });

    // Fetch Stats when Date changes
    useEffect(() => {
        const fetchEvaluation = async () => {
            const m = selectedDate.getMonth() + 1;
            const y = selectedDate.getFullYear();
            try {
                const response = await fetch(`/api/crew/stats?month=${m}&year=${y}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setStats(data);
                }
            } catch (error) {
                console.error("Failed to fetch evaluation stats", error);
            }
        };
        fetchEvaluation();
    }, [selectedDate]);

    // Live Data
    const crewName = user?.name || "Crew Member";
    const activePercentage = stats.active_percentage || 0;
    const yearlyScore = stats.yearly_score || 0;
    const personalityScore = stats.personality_score || 0;
    const activityMonitor = stats.activity_monitor || [];

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    const getAvailableMonths = (year: number) => {
        if (year === currentYear) {
            return Array.from({ length: currentMonth + 1 }, (_, i) => i);
        }
        return Array.from({ length: 12 }, (_, i) => i);
    };

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

    const getCalendarDays = () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];
        for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
        for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
        return days;
    };

    // Calculate Dummy Active Percentage to match Mock Calendar natively
    const calendarDays = getCalendarDays();
    let totalWorkDays = 0;
    let presentDays = 0;

    calendarDays.forEach(day => {
        if (!day) return;
        const now = new Date();
        if (day > now) return; // Skip future days

        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        if (!isWeekend) {
            totalWorkDays++;
            const hash = (day.getDate() + day.getMonth() * 31) % 7;
            // <= 3 (Hadir), 4 (Telat - counts as present?), 5 (Mangkir). Only <= 4 are "present".
            if (hash <= 4 || hash > 5) presentDays++;
        }
    });

    // Override the DB % with the Dummy UI Mock percentage since YoAbsen API is missing
    const displayActivePercentage = totalWorkDays > 0 ? Math.round((presentDays / totalWorkDays) * 100) : 0;

    return (
        <CrewLayout
            title="Evaluation"
            showBack={true}
            onBack={onBack}
        >
            <div className="flex flex-col pb-6">

                {/* 1. Header (Month/Year) - Matches Supervisor Header */}
                <div className="bg-white rounded-3xl p-5 shadow-sm mb-6">
                    <h2 className="text-center text-sm font-bold text-gray-600 mb-4">
                        Evaluation History
                    </h2>

                    {/* Pill Dropdowns */}
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
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                        </div>

                        <div className="relative group w-24">
                            <select
                                value={selectedDate.getFullYear()}
                                onChange={handleYearChange}
                                className="w-full appearance-none bg-gray-50 border border-transparent hover:border-blue-100 rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                            >
                                {Array.from({ length: currentYear - 2024 + 1 }, (_, i) => 2024 + i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                        </div>
                    </div>
                </div>

                {/* 2. Stats View */}
                <div className="space-y-4">

                    {/* Profile & Active Percentage */}
                    <div className="bg-gray-100 rounded-3xl p-5">
                        <p className="text-sm font-bold text-gray-700 mb-2">{crewName}</p>
                        <div className="w-full bg-white rounded-full h-4 mb-2 overflow-hidden">
                            <div className="bg-green-500 h-full rounded-full transition-all duration-1000" style={{ width: `${displayActivePercentage}%` }}></div>
                        </div>
                        <p className="text-xs text-gray-500">Active Percentage - {displayActivePercentage}% ({selectedDate.toLocaleString('default', { month: 'long' })})</p>
                    </div>

                    {/* Activity Monitor */}
                    <div className="bg-gray-100 rounded-3xl p-5">
                        <p className="text-sm font-medium text-gray-600 mb-3">{selectedDate.toLocaleString('default', { month: 'long' })} Activity Monitor</p>

                        {activityMonitor.length > 0 ? (
                            <>
                                <div className="w-full h-4 bg-gray-300 rounded-full overflow-hidden flex mb-4">
                                    {activityMonitor.map((item: any, idx: number) => (
                                        <div key={idx} className={`h-full ${['bg-green-400', 'bg-blue-600', 'bg-yellow-400', 'bg-purple-500'][idx % 4]}`} style={{ width: `${item.percentage}%` }}></div>
                                    ))}
                                </div>
                                <div className="space-y-2">
                                    {activityMonitor.map((item: any, idx: number) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <div className={`w-3 h-3 rounded-full ${['bg-green-400', 'bg-blue-600', 'bg-yellow-400', 'bg-purple-500'][idx % 4]} shrink-0`}></div>
                                            <span className="text-xs font-medium text-gray-600">{item.label} - {item.percentage}%</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-xs text-gray-400 italic">No activity logged yet for this month.</p>
                        )}
                    </div>

                    {/* Personality Score */}
                    <div className="bg-gray-100 rounded-3xl p-5">
                        <p className="text-xs font-medium text-gray-600 mb-2 uppercase">POINT SIKAP KEPRIBADIAN ({selectedDate.toLocaleString('default', { month: 'long' })})</p>
                        <p className="text-sm font-bold text-gray-700">Total Point : {personalityScore}</p>
                    </div>

                    {/* Calendar View */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-gray-800">{selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                        </div>

                        <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 font-bold uppercase mb-3">
                            <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                        </div>

                        <div className="grid grid-cols-7 gap-y-3">
                            {getCalendarDays().map((day, idx) => {
                                if (!day) return <div key={idx}></div>;
                                const hash = (day.getDate() + day.getMonth() * 31) % 7;
                                const now = new Date();
                                const isToday = day.toDateString() === now.toDateString();
                                const isFuture = day > now;

                                let bg = 'bg-gray-200';
                                let text = 'text-gray-700';

                                if (isFuture) {
                                    bg = 'bg-gray-50';
                                    text = 'text-gray-300';
                                } else {
                                    // Mock Attendance Logic based on User Request
                                    if (day.getDay() === 0 || day.getDay() === 6) {
                                        // Weekend -> Libur (Abu)
                                        bg = 'bg-gray-400'; text = 'text-white';
                                    } else {
                                        // Weekday dummy
                                        if (hash <= 3) { bg = 'bg-green-500'; text = 'text-white'; } // Hadir
                                        else if (hash === 4) { bg = 'bg-yellow-400'; text = 'text-white'; } // Telat
                                        else if (hash === 5) { bg = 'bg-red-500'; text = 'text-white'; } // Mangkir
                                        else { bg = 'bg-green-500'; text = 'text-white'; } // Default hadir
                                    }
                                }

                                return (
                                    <div key={idx} className="flex justify-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${bg} ${text} ${isToday ? 'ring-2 ring-purple-500 ring-offset-2' : ''}`}>
                                            {day.getDate()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Yearly Overall Point */}
                    <div className="bg-gray-100 rounded-3xl p-6 pb-12">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-4">YEARLY OVERALL POINT</p>
                        <p className="text-sm font-medium text-gray-500 mb-1">Total Point :</p>
                        <p className="text-6xl font-medium text-black tracking-tight">{yearlyScore}</p>
                    </div>
                </div>
            </div>
        </CrewLayout>
    );
}
