import React, { useState, useEffect } from 'react';
import { ChevronDown, Camera } from 'lucide-react';
import CrewLayout from './CrewLayout';

interface MobileCrewHistoryProps {
    user: any;
    onBack: () => void;
    onSelectTask: (task: any) => void;
    refreshTrigger?: number;
}

export default function MobileCrewHistory({ user, onBack, onSelectTask, refreshTrigger }: MobileCrewHistoryProps) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'ACTIVITY' | 'TASKS'>('TASKS'); // Default to TASKS for now
    const [showRoleDropdown, setShowRoleDropdown] = useState(false);

    // Real Data State
    const [tasks, setTasks] = useState<any[]>([]);
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Fetch Tasks & Activities
    useEffect(() => {
        const fetchData = async () => {
            if (!user?.user_id) return;

            setLoading(true);
            try {
                const dateStr = selectedDate.toLocaleDateString('en-CA');
                const token = localStorage.getItem('auth_token') || '';

                const taskReq = fetch(`/api/crews/${user.user_id}/tasks?date=${dateStr}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const activityReq = fetch(`/api/crew/activity-logs?date=${dateStr}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const [taskRes, activityRes] = await Promise.all([taskReq, activityReq]);

                if (taskRes.ok) setTasks(await taskRes.json());
                if (activityRes.ok) setActivityLogs(await activityRes.json());

            } catch (error) {
                console.error("Failed to fetch history data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedDate, user?.user_id, refreshTrigger]);



    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const isFutureDate = (date: Date) => date > today;

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

    const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

    const renderCalendar = () => {
        const daysInMonth = getDaysInMonth(selectedDate);
        const firstDay = getFirstDayOfMonth(selectedDate);
        const days = [];

        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8 md:h-9"></div>);

        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i);
            const isSelected = i === selectedDate.getDate();
            const isFuture = isFutureDate(date);

            days.push(
                <button
                    key={i}
                    onClick={() => {
                        if (!isFuture) {
                            const newDate = new Date(selectedDate);
                            newDate.setDate(i);
                            setSelectedDate(newDate);
                        }
                    }}
                    disabled={isFuture}
                    className={`h-8 w-8 md:h-9 md:w-9 rounded-full flex flex-col items-center justify-center text-xs md:text-sm font-medium transition relative ${isSelected
                        ? 'bg-blue-600 text-white shadow-md'
                        : isFuture
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                >
                    {i}
                </button>
            );
        }
        return days;
    };

    return (
        <CrewLayout
            title="History"
            showBack={true}
            onBack={onBack}
            allowScroll={false} // Use internal scroll for list
        >
            <div className="flex flex-col h-full">
                {/* Calendar Card */}
                <div className="bg-white rounded-3xl p-5 mb-4 flex-shrink-0 relative shadow-sm">
                    {/* Month/Year Selection */}
                    <div className="flex justify-between items-center mb-4 px-1">
                        <div className="flex items-center justify-between w-full gap-2">
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

                    <div className="grid grid-cols-7 text-center mb-2 border-b border-gray-100 pb-2">
                        {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(day => (
                            <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-y-1 justify-items-center">
                        {renderCalendar()}
                    </div>
                </div>

                {/* List Card */}
                <div className="bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.03)] flex-1 flex flex-col min-h-0 relative -mx-2 px-4 pt-4">
                    <div className="flex justify-center mb-2 shrink-0">
                        <div className="w-12 h-1.5 bg-blue-600 rounded-full"></div>
                    </div>

                    <div className="flex justify-between items-center mb-4 sticky top-0 bg-white py-1 z-10 w-full shrink-0">
                        <h3 className="font-bold text-gray-800 text-sm">
                            {selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}
                        </h3>

                        <div className="relative">
                            <button
                                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                                className="flex items-center gap-2 text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95 transition"
                            >
                                {viewMode === 'ACTIVITY' ? 'Activity Log' : 'Task History'}
                                <ChevronDown size={14} className={`transition ${showRoleDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showRoleDropdown && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl z-20 overflow-hidden border border-gray-100 animate-slide-in">
                                    <button
                                        onClick={() => { setViewMode('ACTIVITY'); setShowRoleDropdown(false); }}
                                        className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-gray-50 flex items-center justify-between ${viewMode === 'ACTIVITY' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
                                    >
                                        Activity Log
                                        {viewMode === 'ACTIVITY' && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                                    </button>
                                    <button
                                        onClick={() => { setViewMode('TASKS'); setShowRoleDropdown(false); }}
                                        className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-gray-50 flex items-center justify-between ${viewMode === 'TASKS' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
                                    >
                                        Task History
                                        {viewMode === 'TASKS' && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 pb-20 -mx-2 px-2 space-y-3">
                        {viewMode === 'ACTIVITY' ? (
                            activityLogs.length > 0 ? (
                                activityLogs.map((log, idx) => (
                                    <div key={idx} className="bg-gray-100/50 rounded-2xl p-4 flex items-center justify-between border border-transparent hover:border-gray-200 transition">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-gray-800 font-bold text-sm capitalize">{log.role}</span>
                                            <span className="text-gray-400 text-[10px] italic capitalize">{log.action ? log.action.replace('_', ' ') : 'Role Change'}</span>
                                        </div>
                                        <span className="text-gray-500 text-xs font-semibold bg-white px-2 py-1 rounded-lg shadow-sm border border-gray-100">{log.time}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-400 text-xs">
                                    No activity recorded for this date.
                                </div>
                            )
                        ) : loading ? (
                            <div className="flex justify-center py-10 text-gray-400">Loading tasks...</div>
                        ) : (
                            tasks.length > 0 ? (
                                tasks.map((task) => (
                                    <div
                                        key={task.task_id}
                                        className="bg-gray-100/50 rounded-2xl p-4 flex items-center justify-between gap-3 border border-transparent hover:border-gray-200 transition"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${task.status === 'approved' ? 'bg-blue-100 border-blue-500 text-blue-600' : 'border-gray-300 bg-white'}`}>
                                                {task.status === 'approved' && <span className="font-bold text-xs">✓</span>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-gray-800 text-sm line-clamp-1 mb-0.5">{task.title}</p>
                                                <p className="text-[10px] text-gray-400">{new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onSelectTask(task)}
                                            className="bg-blue-600 text-white shadow-blue-200 text-[10px] font-bold py-2 px-4 rounded-xl shadow-md active:scale-95 transition-transform flex items-center gap-1"
                                        >
                                            <Camera size={14} />
                                            Foto
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-400 text-xs">
                                    No tasks recorded for this date.
                                </div>
                            )
                        )}
                        <div className="h-4"></div>
                    </div>
                </div>
            </div>
        </CrewLayout>
    );
}
