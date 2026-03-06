import React, { useEffect, useState } from 'react';
import { BarChart2, CheckSquare, Camera, ChevronDown, Clock } from 'lucide-react';
import TaskPreview from '../general/TaskPreview'; // Ensure this uses default import

export default function SupervisorPerformance() {
    const [activeTab, setActiveTab] = useState<'STATS' | 'CHECKLIST'>('STATS');
    const [stats, setStats] = useState<any>(null);
    const [myTasks, setMyTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());

    // Preview Logic State
    const [previewTask, setPreviewTask] = useState<any>(null);

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const isFutureDate = (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const t = new Date(today);
        t.setHours(0, 0, 0, 0);
        return d > t;
    };

    const getAvailableMonths = (year: number) => {
        if (year === currentYear) {
            return Array.from({ length: currentMonth + 1 }, (_, i) => i);
        }
        return Array.from({ length: 12 }, (_, i) => i);
    };

    useEffect(() => {
        fetchStats();
        fetchMyTasks();
    }, [selectedDate]);

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

        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8"></div>);
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
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${isSelected
                        ? 'bg-primary text-white shadow-md'
                        : isFuture
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                >
                    {i}
                </button>
            );
        }
        return days;
    };

    const fetchStats = async () => {
        try {
            const m = selectedDate.getMonth() + 1;
            const y = selectedDate.getFullYear();
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/supervisor/stats?month=${m}&year=${y}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error("Failed to fetch stats", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMyTasks = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const userRes = await fetch('/api/supervisor/crews', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            let supervisorId = null;
            if (userRes.ok) {
                const userData = await userRes.json();
                supervisorId = userData.supervisor.id;
            }

            if (supervisorId) {
                const dateStr = selectedDate.toLocaleDateString('en-CA');
                const res = await fetch(`/api/supervisor/${supervisorId}/tasks?date=${dateStr}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMyTasks(data);
                }
            }
        } catch (error) {
            console.error("Failed to fetch my tasks", error);
        }
    };

    // Since supervisors can't delete proofs on desktop, we pass a dummy function or hide the delete button in TaskPreview via props if supported.
    // However, TaskPreview expects onDeleteProof. Let's provide a dummy one that alerts or does nothing, as the requirement is view-only.
    // Or better, implement it but maybe restrict it? For now, let's keep it simple.
    const handleDeleteProof = async (taskId: number) => {
        alert("Deletion is only available on mobile.");
    };

    const handleViewPhoto = (task: any) => {
        setPreviewTask(task);
    };

    const handleClosePreview = () => {
        setPreviewTask(null);
    };

    if (loading) return <div className="p-10 text-gray-400">Loading...</div>;

    return (
        <div className="flex-1 h-full overflow-y-auto p-8 bg-gray-50 flex flex-col">
            {/* Header & Tabs */}
            <div className="flex justify-between items-center mb-8 flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-800">My Workspace</h1>

                <div className="bg-white p-1 rounded-xl flex shadow-sm border border-gray-100">
                    <button
                        onClick={() => setActiveTab('STATS')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'STATS'
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-gray-500 hover:bg-gray-50'
                            }`}
                    >
                        <BarChart2 size={16} />
                        Performance
                    </button>
                    <button
                        onClick={() => setActiveTab('CHECKLIST')}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'CHECKLIST'
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-gray-500 hover:bg-gray-50'
                            }`}
                    >
                        <CheckSquare size={16} />
                        Checklist
                    </button>
                </div>
            </div>

            {/* CONTENT: STATS */}
            {activeTab === 'STATS' && stats && (
                <div className="animate-fade-in">

                    {/* Month/Year Filter for Stats */}
                    {/* Month/Year Filter for Stats */}
                    <div className="flex gap-2 mb-6 justify-start">
                        <div className="relative group w-40">
                            <select
                                value={selectedDate.getMonth()}
                                onChange={handleMonthChange}
                                className="w-full appearance-none bg-white border border-gray-200 hover:border-purple-300 rounded-xl px-4 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors shadow-sm"
                            >
                                {getAvailableMonths(selectedDate.getFullYear()).map(i => (
                                    <option key={i} value={i}>
                                        {new Date(0, i).toLocaleString('en-US', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                        </div>
                        <div className="relative group w-28">
                            <select
                                value={selectedDate.getFullYear()}
                                onChange={handleYearChange}
                                className="w-full appearance-none bg-white border border-gray-200 hover:border-purple-300 rounded-xl px-4 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors shadow-sm"
                            >
                                {Array.from({ length: new Date().getFullYear() - 2024 + 1 }, (_, i) => 2024 + i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                        </div>
                    </div>

                    {/* Side-by-Side Content Grid */}
                    <div className="flex flex-col lg:flex-row gap-6 mb-8">
                        {/* Left Side: Attendance Calendar */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex-1 lg:max-w-[400px]">
                            <h3 className="text-sm font-semibold text-gray-600 mb-4">Attendance History</h3>
                            <div className="mb-2">
                                <div className="grid grid-cols-7 text-center mb-2 border-b border-gray-100 pb-2">
                                    {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(day => (
                                        <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 gap-y-3 justify-items-center">
                                    {(() => {
                                        const daysInMonth = getDaysInMonth();
                                        const firstDay = getFirstDayOfMonth();
                                        const days = [];

                                        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8"></div>);
                                        for (let i = 1; i <= daysInMonth; i++) {
                                            const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i);
                                            const isFuture = isFutureDate(date);
                                            const isToday = date.getDate() === today.getDate() &&
                                                date.getMonth() === today.getMonth() &&
                                                date.getFullYear() === today.getFullYear();

                                            // Mock Attendance Coloring
                                            let attendanceColor = 'bg-gray-100 text-gray-700';
                                            if (!isFuture) {
                                                const hash = (i + selectedDate.getMonth() * 31) % 7;
                                                if (hash <= 3) attendanceColor = 'bg-green-500 text-white shadow-sm';
                                                else if (hash === 4) attendanceColor = 'bg-yellow-400 text-white shadow-sm';
                                                else if (hash === 5) attendanceColor = 'bg-red-500 text-white shadow-sm';
                                                else attendanceColor = 'bg-gray-300 text-white';
                                            } else {
                                                attendanceColor = 'text-gray-300 cursor-not-allowed';
                                            }

                                            days.push(
                                                <div
                                                    key={i}
                                                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${attendanceColor} ${isToday ? 'ring-2 ring-primary ring-offset-2 z-10' : ''}`}
                                                >
                                                    {i}
                                                </div>
                                            );
                                        }
                                        return days;
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Stats & AVG Point */}
                        <div className="flex-1 flex flex-col gap-6">
                            {/* My AVG Point - Main Bar */}
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex-shrink-0">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-sm font-semibold text-gray-600">My AVG Point</h3>
                                    <span className="text-sm font-bold text-gray-800">{stats.my_avg_point}%</span>
                                </div>
                                <div className="w-full bg-purple-100 rounded-full h-4 overflow-hidden">
                                    <div
                                        className="bg-yellow-400 h-4 rounded-full transition-all duration-500"
                                        style={{ width: `${stats.my_avg_point}%` }}
                                    ></div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 h-full">
                                {/* Task for SC */}
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">{stats.task_for_sc.label || 'Task for SC'}</h3>
                                    <div className="w-full bg-purple-100 rounded-full h-3 overflow-hidden mb-2">
                                        <div
                                            className="bg-red-500 h-3 rounded-full transition-all duration-500"
                                            style={{ width: `${(stats.task_for_sc.completed / stats.task_for_sc.total) * 100}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-gray-400">{stats.task_for_sc.completed}% Completed</p>
                                </div>

                                {/* Task Completed From SM/RM */}
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">{stats.task_from_manager.label || 'Task Completed From SM/RM'}</h3>
                                    <div className="w-full bg-purple-100 rounded-full h-3 overflow-hidden mb-2">
                                        <div
                                            className="bg-red-500 h-3 rounded-full transition-all duration-500"
                                            style={{ width: `${(stats.task_from_manager.completed / stats.task_from_manager.total) * 100}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-gray-400">{stats.task_from_manager.completed}%</p>
                                </div>

                                {/* Task Given (Monthly) */}
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">Task Given (Monthly)</h3>
                                    <div className="bg-gray-200 rounded-xl p-4 text-center">
                                        <span className="font-bold text-gray-700">{stats.monthly_task_given}</span>
                                    </div>
                                </div>

                                {/* AVG Service Crew Point */}
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">AVG Service Crew Point</h3>
                                    <div className="bg-gray-200 rounded-xl p-4 text-center">
                                        <span className="font-bold text-gray-700">{stats.avg_service_crew_point}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CONTENT: CHECKLIST (Split Layout) */}
            {activeTab === 'CHECKLIST' && (
                <div className="flex-1 min-h-0 flex gap-6">
                    {/* Left: Task List */}
                    <div className="flex-1 flex flex-col h-full bg-white rounded-3xl shadow-sm border border-gray-100 p-6 overflow-hidden">
                        {/* Header with Date Selectors */}
                        <div className="mb-4 flex-shrink-0">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-800">Assignments</h3>
                                {/* Month/Year Selectors */}
                                <div className="flex gap-2">
                                    <div className="relative group w-32">
                                        <select
                                            value={selectedDate.getMonth()}
                                            onChange={handleMonthChange}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-purple-200 rounded-xl px-3 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors"
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
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-purple-200 rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {Array.from({ length: new Date().getFullYear() - 2024 + 1 }, (_, i) => 2024 + i).map(year => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                                    </div>
                                </div>
                            </div>

                            {/* GRID CALENDAR - Replaces horizontal strip */}
                            <div className="mb-2">
                                <div className="grid grid-cols-7 text-center mb-2 border-b border-gray-100 pb-2">
                                    {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(day => (
                                        <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 gap-y-1 justify-items-center">
                                    {renderCalendar()}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                            {myTasks.length === 0 && (
                                <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-2xl">
                                    No assignments found for today.
                                </div>
                            )}

                            {myTasks.map((task) => (
                                <div key={task.task_id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition group">
                                    <div className="flex items-start gap-4">
                                        {/* Status Icon */}
                                        <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-default ${task.status === 'approved'
                                            ? 'bg-purple-100 border-primary text-primary'
                                            : 'border-gray-300'
                                            }`}>
                                            {task.status === 'approved' && <span className="font-bold text-xs">✓</span>}
                                        </div>

                                        <div className="flex-1">
                                            <h4 className={`text-sm font-medium ${task.status === 'approved' ? 'text-gray-800' : 'text-gray-600'}`}>{task.title}</h4>
                                            <p className="text-[10px] text-gray-400 mt-1">Due {new Date(task.due_at).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</p>

                                            {task.note && (
                                                <div className="bg-gray-50 p-2 rounded-lg text-xs text-gray-500 italic inline-block mt-2">
                                                    "{task.note}"
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleViewPhoto(task)}
                                                className="bg-primary text-white text-[10px] font-bold py-1.5 px-4 rounded-lg hover:bg-purple-700 transition shadow-sm flex items-center gap-1"
                                            >
                                                <Camera size={12} />
                                                Foto
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Preview Panel (Fixed) */}
                    <div className="w-1/3 flex flex-col h-full bg-white rounded-3xl shadow-sm border border-gray-100 p-6 transition-all duration-300 ease-in-out">
                        {previewTask ? (
                            <TaskPreview
                                task={previewTask}
                                onClose={handleClosePreview}
                                onDeleteProof={handleDeleteProof}
                            />
                        ) : (
                            <div className="flex flex-col h-full">
                                <h2 className="font-bold text-gray-800 text-lg mb-4">Task Proof</h2>
                                <div className="flex-1 bg-gray-50 rounded-2xl flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-100">
                                    <Camera size={48} className="mb-4 opacity-20" />
                                    <p className="text-sm font-medium">Select a task to view proof</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div >
    );
}
