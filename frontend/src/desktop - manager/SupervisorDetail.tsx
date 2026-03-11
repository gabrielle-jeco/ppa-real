import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Camera, Trash2, ChevronDown } from 'lucide-react';
import AddTaskModal from '../general/AddTaskModal';
import TaskPreview from '../general/TaskPreview';
import EvaluationForm from '../general/EvaluationForm';

interface SupervisorDetailProps {
    supervisor: any;
    onTaskChange?: () => void;
}

export default function SupervisorDetail({ supervisor, onTaskChange }: SupervisorDetailProps) {
    const [tasks, setTasks] = useState<any[]>([]);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

    // Right Panel Modes: 'STATS' (Default) or 'PREVIEW'
    const [rightPanelMode, setRightPanelMode] = useState<'STATS' | 'PREVIEW'>('STATS');
    const [previewTask, setPreviewTask] = useState<any>(null);

    // Main Mode: 'TASKS' or 'EVALUATION'
    const [viewMode, setViewMode] = useState<'TASKS' | 'EVALUATION'>('TASKS');
    const [todayEvaluation, setTodayEvaluation] = useState<any>(null);

    // Stats State
    const [stats, setStats] = useState<any>(null);

    // Filter State
    const [selectedDate, setSelectedDate] = useState(new Date());

    useEffect(() => {
        if (supervisor?.id) {
            fetchTasks();
            fetchEvaluationStatus();
            fetchSupervisorStats();
            setRightPanelMode('STATS');
            setViewMode('TASKS');
        }
    }, [supervisor?.id]);

    useEffect(() => {
        if (supervisor?.id) {
            fetchTasks();
            fetchEvaluationStatus();
            fetchSupervisorStats();
        }
    }, [selectedDate, supervisor?.id]);

    const fetchSupervisorStats = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const m = selectedDate.getMonth() + 1;
            const y = selectedDate.getFullYear();
            const d = selectedDate.getDate(); // Pass day to calculate daily SC point
            const res = await fetch(`/api/manager/supervisors/${supervisor.id}/stats?month=${m}&year=${y}&day=${d}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error("Fetch stats failed", error);
        }
    };

    const fetchEvaluationStatus = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const dateStr = selectedDate.toLocaleDateString('en-CA'); // YYYY-MM-DD
            const res = await fetch(`/api/evaluations/check/${supervisor.id}?date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTodayEvaluation(data); // null or object
            }
        } catch (error) {
            console.error("Check evaluation failed", error);
        }
    };

    const fetchTasks = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            // Format Date YYYY-MM-DD (Local)
            const dateStr = selectedDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
            const res = await fetch(`/api/supervisor/${supervisor.id}/tasks?date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTasks(data);
            }
        } catch (error) {
            console.error("Fetch tasks failed", error);
        }
    };

    // Helper: Is it today?
    const isToday = (date: Date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    // Calendar Generation Logic
    const getCalendarDays = () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const days = [];
        // Padding for starting day (Sunday=0, Monday=1, etc)
        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push(null);
        }
        // Days of month
        for (let i = 1; i <= lastDay.getDate(); i++) {
            days.push(new Date(year, month, i));
        }
        return days;
    };

    const handleAddTask = async (taskData: any) => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    supervisor_id: supervisor.id,
                    ...taskData
                })
            });

            if (res.ok) {
                fetchTasks(); // Refresh list
                fetchSupervisorStats(); // Refresh stats
                onTaskChange?.(); // Update parent list
            }
        } catch (error) {
            console.error("Add task failed", error);
        }
    };

    const handleDeleteTask = async (taskId: number) => {
        if (!window.confirm("Delete this task?")) return;
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`/api/tasks/${taskId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setTasks(tasks.filter(t => t.task_id !== taskId));
            fetchSupervisorStats(); // Refresh stats
            onTaskChange?.(); // Update parent list
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    const handleToggleStatus = async (task: any) => {
        const newStatus = task.status === 'approved' ? 'pending' : 'approved';

        // Optimistic Update
        setTasks(tasks.map(t =>
            t.task_id === task.task_id ? { ...t, status: newStatus } : t
        ));

        if (previewTask?.task_id === task.task_id) {
            setPreviewTask({ ...previewTask, status: newStatus });
        }

        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`/api/tasks/${task.task_id}/status`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
            fetchSupervisorStats(); // Refresh stats
            onTaskChange?.(); // Update parent list
        } catch (error) {
            console.error("Status update failed", error);
            fetchTasks(); // Revert on error
        }
    };

    const handleDeleteProof = async (evidenceId: number) => {
        if (!previewTask) return;
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/tasks/${previewTask.task_id}/evidence`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ evidence_id: evidenceId })
            });
            if (res.ok) {
                // Update local state by removing the specific image
                const updateEvidences = (evs: any[]) => evs.filter((e: any) => e.id !== evidenceId);

                setTasks(tasks.map(t => t.task_id === previewTask.task_id ? {
                    ...t,
                    evidences: updateEvidences(t.evidences || [])
                } : t));
                setPreviewTask({
                    ...previewTask,
                    evidences: updateEvidences(previewTask.evidences || [])
                });
            } else {
                alert('Failed to delete image.');
            }
        } catch (error) {
            console.error("Failed to delete proof", error);
        }
    };

    const handleViewPhoto = (task: any) => {
        setPreviewTask(task);
        setRightPanelMode('PREVIEW');
    };

    const handleClosePreview = () => {
        setRightPanelMode('STATS');
        setPreviewTask(null);
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 p-6 overflow-hidden relative">

            <AddTaskModal
                isOpen={isTaskModalOpen}
                onClose={() => setIsTaskModalOpen(false)}
                onSubmit={handleAddTask}
                defaultDate={selectedDate.toLocaleDateString('en-CA')}
            />

            {/* Top Banner (Overlay Style) */}
            <div className="items-center justify-between hidden lg:flex mb-6">
                {/* Header placeholder */}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0">

                {/* 1. Left Panel (Profile & Controls) - Col Span 3 */}
                {/* 1. Left Panel (Profile & Controls) - Compact: Span 4, Full: Span 3 */}
                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-3 flex flex-col gap-6 h-full overflow-y-auto pr-2">

                    {/* Profile Card */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-primary mb-1">{supervisor.name}</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            Role as <span className="underline decoration-primary">Supervisor</span> at <br />
                            <span className="font-semibold">{supervisor.location}</span>
                        </p>
                        <button
                            onClick={() => setViewMode('EVALUATION')}
                            className={`text-xs font-bold py-2 px-6 rounded-full transition w-full shadow-md ${viewMode === 'EVALUATION'
                                ? 'bg-purple-100 text-primary border-2 border-primary'
                                : 'bg-primary text-white border-2 border-transparent hover:bg-purple-700'
                                }`}
                        >
                            Evaluation
                        </button>
                    </div>

                    {/* Activity & Task Control */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">Activity & Task</h3>
                            <button
                                onClick={() => setViewMode('TASKS')}
                                className={`text-[10px] font-bold py-1 px-3 rounded-full transition border ${viewMode === 'TASKS'
                                    ? 'bg-purple-100 text-primary border-primary'
                                    : 'bg-primary text-white border-transparent hover:bg-purple-700'
                                    }`}
                            >
                                View
                            </button>
                        </div>

                        {/* Task Control (Simplified) */}
                        <div className="mb-0">
                            <h4 className="font-bold text-gray-800 text-sm mb-3">Task</h4>
                            <div className="relative mb-3 h-12"> {/* Fixed height container */}
                                <button
                                    onClick={() => setIsTaskModalOpen(true)}
                                    disabled={!isToday(selectedDate)}
                                    className={`w-full h-full border rounded-lg px-4 flex items-center justify-between text-xs font-semibold shadow-sm transition group ${isToday(selectedDate)
                                        ? 'bg-white border-gray-200 hover:border-primary text-gray-600 hover:text-primary cursor-pointer'
                                        : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    <span>{isToday(selectedDate) ? 'Add New Task' : 'History View (Read Only)'}</span>
                                    {isToday(selectedDate) && (
                                        <span className="bg-gray-100 group-hover:bg-purple-100 text-gray-500 group-hover:text-primary rounded-full w-5 h-5 flex items-center justify-center text-lg leading-none pb-0.5">+</span>
                                    )}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                        style={{ width: `${tasks.length > 0 ? (tasks.filter(t => t.status === 'approved').length / tasks.length) * 100 : 0}%` }}
                                    ></div>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-400">Task Completed: {tasks.filter(t => t.status === 'approved').length}/{tasks.length}</p>
                        </div>

                        {/* Interactive Calendar */}
                        <div className="bg-white rounded-2xl p-6 mt-6 border border-gray-100 shadow-sm relative overflow-hidden">
                            {/* Decorative Background Blob */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full -z-0 opacity-50"></div>

                            <div className="flex justify-between items-center mb-6 text-sm font-semibold text-gray-700 relative z-10 px-2">
                                {/* Interactive Dropdowns for Task View - RESTORED FOR ALL MODES */}
                                <div className="flex items-center gap-2 w-full">
                                    <div className="relative group flex-1">
                                        <select
                                            value={selectedDate.getMonth()}
                                            onChange={(e) => {
                                                const newDate = new Date(selectedDate);
                                                newDate.setMonth(parseInt(e.target.value));
                                                setSelectedDate(newDate);
                                            }}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl px-3 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {/* Logic: If Year < CurrentYear, Show All Months. Else Show up to Current Month */}
                                            {Array.from({ length: 12 }, (_, i) => i)
                                                .filter(m => selectedDate.getFullYear() < new Date().getFullYear() || m <= new Date().getMonth())
                                                .map(i => (
                                                    <option key={i} value={i} className="text-sm">
                                                        {new Date(0, i).toLocaleString('en-US', { month: 'long' })}
                                                    </option>
                                                ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-primary transition-colors" />
                                    </div>

                                    <div className="relative group w-24">
                                        <select
                                            value={selectedDate.getFullYear()}
                                            onChange={(e) => {
                                                const newDate = new Date(selectedDate);
                                                newDate.setFullYear(parseInt(e.target.value));
                                                // Handle edge case: e.g. switching from earlier year Dec to current year (if current is Feb) -> clamp month
                                                const today = new Date();
                                                if (parseInt(e.target.value) === today.getFullYear() && newDate.getMonth() > today.getMonth()) {
                                                    newDate.setMonth(today.getMonth());
                                                }
                                                setSelectedDate(newDate);
                                            }}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {/* Logic: Years from 2024 to Current Year */}
                                            {Array.from({ length: new Date().getFullYear() - 2024 + 1 }, (_, i) => 2024 + i).map(year => (
                                                <option key={year} value={year} className="text-sm">{year}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-primary transition-colors" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 font-medium uppercase tracking-wider gap-y-4 mb-2 relative z-10">
                                <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                            </div>
                            <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-700 gap-y-3 relative z-10">
                                {getCalendarDays().map((day, idx) => {
                                    if (!day) return <div key={idx}></div>;

                                    // Evaluation Mode: Attendance View
                                    if (viewMode === 'EVALUATION') {
                                        const now = new Date();
                                        const isToday = day.getDate() === now.getDate() && day.getMonth() === now.getMonth() && day.getFullYear() === now.getFullYear();
                                        const isFuture = day > now && !isToday; // strict future

                                        // Attendance Logic (Dummy)
                                        let attendanceColor = 'text-gray-700'; // Default

                                        if (isFuture) {
                                            attendanceColor = 'text-gray-300';
                                        } else {
                                            // 0: Present (Green), 1: Present (Green), 2: Sick (Yellow), 3: Alpha (Red), 4: Off (Grey)
                                            const hash = (day.getDate() + day.getMonth() * 31) % 7;
                                            // Skew towards present
                                            if (hash <= 3) { // Present
                                                attendanceColor = 'bg-green-500 text-white shadow-sm';
                                            } else if (hash === 4) { // Sick/Leave
                                                attendanceColor = 'bg-yellow-400 text-white shadow-sm';
                                            } else if (hash === 5) { // Alpha
                                                attendanceColor = 'bg-red-500 text-white shadow-sm';
                                            } else { // Off
                                                attendanceColor = 'bg-gray-300 text-white';
                                            }
                                        }

                                        // Render Static Dot (Smaller, Non-Interactive)
                                        return (
                                            <div key={idx} className="flex justify-center relative">
                                                <div
                                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium transition-all cursor-default 
                                                        ${attendanceColor} 
                                                        ${isToday ? 'ring-2 ring-purple-500 ring-offset-2 z-10 font-bold' : ''}
                                                    `}
                                                >
                                                    {day.getDate()}
                                                </div>
                                            </div>
                                        );
                                    }

                                    // Standard Task Mode Rendering
                                    const isSelected = day.getDate() === selectedDate.getDate() && day.getMonth() === selectedDate.getMonth() && day.getFullYear() === selectedDate.getFullYear();
                                    const now = new Date();
                                    const isFuture = day > now;

                                    return (
                                        <div key={idx} className="flex justify-center">
                                            <button
                                                onClick={() => {
                                                    if (!isFuture) setSelectedDate(day);
                                                }}
                                                disabled={isFuture}
                                                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] transition ${isSelected
                                                    ? 'bg-primary text-white shadow-md transform scale-110'
                                                    : isFuture
                                                        ? 'text-gray-300 cursor-not-allowed'
                                                        : 'hover:bg-purple-100 text-gray-700'
                                                    }`}
                                            >
                                                {day.getDate()}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Middle Panel (Task List) - Col Span 5 */}
                {/* 2. Middle Panel (Task List) - Compact: Span 4, Full: Span 5 */}
                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-5 flex flex-col h-full overflow-hidden">
                    {viewMode === 'TASKS' ? (
                        <>
                            <div className="mb-4">
                                <h2 className="font-bold text-gray-800 text-lg">{isToday(selectedDate) ? 'Task List' : 'Task History'}</h2>
                                <p className="text-sm text-gray-400">
                                    {isToday(selectedDate) ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                                {tasks.length === 0 && (
                                    <div className="text-center text-gray-400 py-10">
                                        No tasks found for this date.
                                        {isToday(selectedDate) && " Click '+' to add one."}
                                    </div>
                                )}
                                {tasks.map((task) => (
                                    <div key={task.task_id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition group">
                                        <div className="flex items-start gap-3">
                                            <div
                                                onClick={() => isToday(selectedDate) && handleToggleStatus(task)}
                                                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${task.status === 'approved' ? 'bg-purple-100 border-primary text-primary' : 'border-gray-300'
                                                    } ${isToday(selectedDate) ? 'cursor-pointer hover:border-primary' : 'cursor-default opacity-60'}`}
                                            >
                                                {task.status === 'approved' && <span className="font-bold text-xs">✓</span>}
                                            </div>
                                            <div className="flex-1">
                                                <p className={`text-sm font-medium ${task.status === 'approved' ? 'text-gray-800' : 'text-gray-600'}`}>
                                                    {task.title}
                                                </p>
                                                <p className="text-[10px] text-gray-400 mt-1">Due: {new Date(task.due_at).toLocaleString()}</p>
                                                {task.note && <p className="text-[10px] text-gray-500 italic mt-0.5">"{task.note}"</p>}
                                            </div>
                                            <div className="flex flex-col gap-2 items-center">
                                                <button
                                                    onClick={() => handleViewPhoto(task)}
                                                    className="bg-primary text-white text-[10px] font-bold py-1.5 px-4 rounded-lg hover:bg-purple-700 transition shadow-sm flex items-center gap-1"
                                                >
                                                    <Camera size={12} />
                                                    Foto
                                                </button>
                                                {isToday(selectedDate) && (
                                                    <button
                                                        onClick={() => handleDeleteTask(task.task_id)}
                                                        className="text-red-400 hover:text-red-600 p-1 opacity-50 group-hover:opacity-100 transition"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        /* EVALUATION MODE */
                        todayEvaluation?.evaluated ? (
                            <div className="flex flex-col items-center justify-center h-full bg-white rounded-2xl p-8 border border-gray-100 text-center">
                                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mb-4">
                                    ✓
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 mb-2">Evaluation Complete</h3>
                                <p className="text-gray-500 mb-6">You have filled the Monthly Evaluation form for this month.</p>
                                <div className="bg-purple-50 p-4 rounded-xl w-full max-w-xs mb-6">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Score</p>
                                    <p className="text-4xl font-bold text-primary">{todayEvaluation.data?.total_score}</p>
                                </div>
                            </div>
                        ) : (
                            <EvaluationForm
                                supervisor={supervisor}
                                targetDate={selectedDate}
                                onSuccess={() => {
                                    fetchEvaluationStatus(); // Refresh to show result
                                }}
                            />
                        )
                    )}
                </div>

                {/* 3. Right Panel (Activity Stats OR Preview) - Col Span 4 */}
                {/* 3. Right Panel (Activity Stats OR Preview) - Compact: Span 4, Full: Span 4 */}
                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-4 flex flex-col h-full ease-in-out duration-300">

                    {(rightPanelMode === 'STATS' || viewMode === 'EVALUATION') ? (
                        viewMode === 'EVALUATION' ? (
                            /* MONTHLY MONITORING (Right Panel) */
                            <div className="h-full flex flex-col">
                                <div className="mb-4">
                                    <h2 className="text-lg font-bold text-gray-800 mb-2">
                                        {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </h2>

                                    {/* --- Supervisor Performance Stats Layout --- */}
                                    {stats ? (
                                        <div className="space-y-6 overflow-y-auto pr-2 pb-4">
                                            {/* My AVG Point */}
                                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h3 className="text-sm font-semibold text-gray-600">My AVG Point</h3>
                                                    <span className="text-sm font-bold text-gray-800">{stats.my_avg_point}%</span>
                                                </div>
                                                <div className="w-full bg-purple-100 rounded-full h-4 overflow-hidden">
                                                    <div className="bg-yellow-400 h-4 rounded-full transition-all duration-500" style={{ width: `${stats.my_avg_point}%` }}></div>
                                                </div>
                                            </div>

                                            {/* Stats Grid */}
                                            <div className="grid grid-cols-1 gap-4">
                                                {/* Task for SC */}
                                                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">{stats.task_for_sc.label}</h3>
                                                    <div className="w-full bg-purple-100 rounded-full h-3 overflow-hidden mb-2">
                                                        <div className="bg-red-500 h-3 rounded-full transition-all duration-500" style={{ width: `${(stats.task_for_sc.completed / Math.max(stats.task_for_sc.total, 1)) * 100}%` }}></div>
                                                    </div>
                                                    <p className="text-xs text-gray-400">{stats.task_for_sc.completed}% Completed</p>
                                                </div>

                                                {/* Task Completed From SM/RM */}
                                                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">{stats.task_from_manager.label}</h3>
                                                    <div className="w-full bg-purple-100 rounded-full h-3 overflow-hidden mb-2">
                                                        <div className="bg-red-500 h-3 rounded-full transition-all duration-500" style={{ width: `${(stats.task_from_manager.completed / Math.max(stats.task_from_manager.total, 1)) * 100}%` }}></div>
                                                    </div>
                                                    <p className="text-xs text-gray-400">{stats.task_from_manager.completed}%</p>
                                                </div>

                                                {/* Dual Grid for smaller items */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                                                        <h3 className="text-[10px] font-semibold text-gray-500 mb-3">Task Given (Monthly)</h3>
                                                        <div className="bg-gray-100 rounded-xl p-2 text-center">
                                                            <span className="font-bold text-gray-700 text-sm">{stats.monthly_task_given}</span>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                                                        <h3 className="text-[10px] font-semibold text-gray-500 mb-3">AVG Service Crew Point</h3>
                                                        <div className="bg-gray-100 rounded-xl p-2 text-center">
                                                            <span className="font-bold text-gray-700 text-sm">{stats.avg_service_crew_point}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center p-6 text-gray-400">Loading Stats...</div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* STANDARD ACTIVITY STATS (Right Panel) */
                            <>
                                <div className="mb-4">
                                    <h2 className="font-bold text-gray-800 text-lg">Activity</h2>
                                    <p className="text-sm text-gray-400">
                                        {/* Dynamic Date for Activity Panel */}
                                        {selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </p>
                                </div>

                                {stats ? (
                                    <div className="space-y-6 overflow-y-auto pr-2">
                                        {/* Daily Stats */}
                                        <div>
                                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
                                                <h3 className="text-xs font-semibold text-gray-500 mb-3">Task Given</h3>
                                                <div className="bg-gray-100 rounded-xl p-3 flex items-center justify-between">
                                                    <span className="font-bold text-gray-700">{stats.daily_task_given || '0 / 0 People'}</span>
                                                </div>
                                            </div>
                                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                                <h3 className="text-xs font-semibold text-gray-500 mb-3">AVG Service Crew Point Today</h3>
                                                <div className="bg-gray-100 rounded-xl p-3 relative overflow-hidden h-12 flex items-center px-4">
                                                    <div className="absolute left-0 top-0 bottom-0 bg-gray-300 opacity-20 transition-all duration-500" style={{ width: `${stats.avg_sc_point_today || 0}%` }}></div>
                                                    <span className="font-bold text-gray-700 relative z-10">{stats.avg_sc_point_today || 0}%</span>
                                                </div>
                                            </div>
                                        </div>

                                        <hr className="border-gray-200" />

                                        {/* Monthly Stats */}
                                        <div>
                                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
                                                <h3 className="text-xs font-semibold text-gray-500 mb-3">Task Given (Monthly)</h3>
                                                <div className="bg-gray-100 rounded-xl p-3 flex items-center justify-between">
                                                    <span className="font-bold text-gray-700">{stats.monthly_task_given || '0 / 0 People'}</span>
                                                </div>
                                            </div>
                                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                                <h3 className="text-xs font-semibold text-gray-500 mb-3">AVG Service Crew Point</h3>
                                                <div className="bg-gray-100 rounded-xl p-3 relative overflow-hidden h-12 flex items-center px-4">
                                                    <div className="absolute left-0 top-0 bottom-0 bg-gray-300 opacity-20 transition-all duration-500" style={{ width: `${stats.avg_service_crew_point || 0}%` }}></div>
                                                    <span className="font-bold text-gray-700 relative z-10">{stats.avg_service_crew_point || 0}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center p-6 text-gray-400">Loading Stats...</div>
                                )}
                            </>
                        )
                    ) : (
                        <TaskPreview
                            task={previewTask}
                            onClose={handleClosePreview}
                            onDeleteProof={handleDeleteProof}
                            readOnly={previewTask.status === 'approved' || !isToday(selectedDate)}
                        />
                    )}
                </div>

            </div>
        </div>
    );
}
