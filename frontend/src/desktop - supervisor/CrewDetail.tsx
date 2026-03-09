import React, { useState, useEffect } from 'react';
import { Camera, Trash2, ChevronDown, Check } from 'lucide-react';
import AddTaskModal from '../general/AddTaskModal';
import TaskPreview from '../general/TaskPreview';
import EvaluationForm from '../general/EvaluationForm';
import SubmissionHistory from './SubmissionHistory';

interface CrewDetailProps {
    crew: any;
    onTaskChange?: () => void;
}

export default function CrewDetail({ crew, onTaskChange }: CrewDetailProps) {
    const [tasks, setTasks] = useState<any[]>([]);

    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

    // Right Panel Modes: 'ACTIVITY', 'PREVIEW', 'HISTORY'
    const [rightPanelMode, setRightPanelMode] = useState<'ACTIVITY' | 'PREVIEW' | 'HISTORY'>('ACTIVITY');
    const [previewTask, setPreviewTask] = useState<any>(null);
    const [viewMode, setViewMode] = useState<'TASKS' | 'EVALUATION'>('TASKS');
    const [todayEvaluation, setTodayEvaluation] = useState<any>(null);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [evalStats, setEvalStats] = useState<any>(null);

    useEffect(() => {
        if (crew?.id) {
            fetchTasks();
            fetchEvaluationStatus();
            fetchActivityLogs();
            setRightPanelMode('ACTIVITY');
            setViewMode('TASKS');
        }
    }, [crew?.id]);

    useEffect(() => {
        fetchTasks();
        fetchEvaluationStatus();
        fetchActivityLogs();
    }, [selectedDate]);

    // Fetch eval stats when crew or month changes
    useEffect(() => {
        if (crew?.id) {
            fetchEvalStats();
        }
    }, [crew?.id, selectedDate]);

    // Fetch Crew's Tasks
    const fetchTasks = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const dateStr = selectedDate.toLocaleDateString('en-CA');
            const res = await fetch(`/api/supervisor/${crew.id}/tasks?date=${dateStr}`, {
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



    const fetchEvaluationStatus = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const dateStr = selectedDate.toLocaleDateString('en-CA');
            const res = await fetch(`/api/evaluations/check/${crew.id}?date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTodayEvaluation(data);
            }
        } catch (error) {
            console.error("Check evaluation failed", error);
        }
    };

    // Fetch Activity Logs for this crew on selected date
    const fetchActivityLogs = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const dateStr = selectedDate.toLocaleDateString('en-CA');
            const res = await fetch(`/api/crew/activity-logs?user_id=${crew.id}&date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setActivityLogs(data);
            }
        } catch (error) {
            console.error("Fetch activity logs failed", error);
        }
    };

    // Fetch Crew Eval Stats (Activity Monitor, Personality, Yearly Score)
    const fetchEvalStats = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const m = selectedDate.getMonth() + 1;
            const y = selectedDate.getFullYear();
            const res = await fetch(`/api/supervisor/crew/${crew.id}/eval-stats?month=${m}&year=${y}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setEvalStats(data);
            }
        } catch (error) {
            console.error("Fetch eval stats failed", error);
        }
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
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
                    supervisor_id: crew.id, // Target User ID
                    ...taskData
                })
            });
            if (res.ok) {
                fetchTasks();
                onTaskChange?.();
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
            onTaskChange?.();
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    const handleToggleStatus = async (task: any) => {
        const newStatus = task.status === 'approved' ? 'pending' : 'approved';
        setTasks(tasks.map(t => t.task_id === task.task_id ? { ...t, status: newStatus } : t));
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
            onTaskChange?.();
        } catch (error) {
            console.error("Status update failed", error);
            fetchTasks();
        }
    };

    const handleDeleteProof = async (taskId: number, type: 'before' | 'after') => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/tasks/${taskId}/evidence?type=${type}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                // Update local state by removing the specific image
                setTasks(tasks.map(t => t.task_id === taskId ? {
                    ...t,
                    ...(type === 'before' ? { before_image: null } : { after_image: null, proof_image: null })
                } : t));
                if (previewTask?.task_id === taskId) {
                    setPreviewTask({
                        ...previewTask,
                        ...(type === 'before' ? { before_image: null } : { after_image: null, proof_image: null })
                    });
                }
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
        setRightPanelMode('ACTIVITY');
        setPreviewTask(null);
    };

    const handleSetViewMode = (mode: 'TASKS' | 'EVALUATION') => {
        setViewMode(mode);
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    // Activity Monitor colors for bar chart
    const monitorColors = ['bg-green-400', 'bg-purple-500', 'bg-blue-400', 'bg-yellow-400', 'bg-red-400', 'bg-pink-400'];
    const dotColors = ['bg-green-400', 'bg-purple-500', 'bg-blue-400', 'bg-yellow-400', 'bg-red-400', 'bg-pink-400'];

    const currentList = tasks;

    return (
        <div className="flex flex-col h-full bg-gray-50 p-6 overflow-hidden relative">
            <AddTaskModal
                isOpen={isTaskModalOpen}
                onClose={() => setIsTaskModalOpen(false)}
                onSubmit={handleAddTask}
                defaultDate={selectedDate.toLocaleDateString('en-CA')}
            />

            <div className="items-center justify-between hidden lg:flex mb-6"></div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-full flex-1 min-h-0">

                {/* 1. Left Panel (Profile & Calendar) - Col Span 5 (LG) / 3 (XL) */}
                {/* 1. Left Panel (Profile & Calendar) - Compact: Span 4, Full: Span 3 */}
                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-3 flex flex-col gap-4 lg:gap-6 h-full overflow-y-auto pr-2 min-h-0">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-primary mb-1">{crew.name}</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            Role as <span className="underline decoration-primary">{crew.current_workstation ? `Crew - ${crew.current_workstation}` : crew.role || 'Crew'}</span> <br />
                            Today
                        </p>
                        <button
                            onClick={() => handleSetViewMode('EVALUATION')}
                            className={`text-xs font-bold py-2 px-6 rounded-full transition w-full shadow-md ${viewMode === 'EVALUATION'
                                ? 'bg-purple-100 text-primary border-2 border-primary'
                                : 'bg-primary text-white border-2 border-transparent hover:bg-purple-700'
                                }`}
                        >
                            Evaluation
                        </button>
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">Activity & Task</h3>
                            <button
                                onClick={() => handleSetViewMode('TASKS')}
                                className={`text-[10px] font-bold py-1 px-3 rounded-full transition border ${viewMode === 'TASKS'
                                    ? 'bg-purple-100 text-primary border-primary'
                                    : 'bg-primary text-white border-transparent hover:bg-purple-700'
                                    }`}
                            >
                                View
                            </button>
                        </div>

                        <div className="mb-0">
                            <h4 className="font-bold text-gray-800 text-sm mb-3">Task</h4>
                            <div className="relative mb-3 h-12">
                                <button
                                    onClick={() => setIsTaskModalOpen(true)}
                                    disabled={!isToday(selectedDate)}
                                    className={`w-full h-full border rounded-lg px-4 flex items-center justify-between text-xs font-semibold shadow-sm transition group ${isToday(selectedDate)
                                        ? 'bg-white border-gray-200 hover:border-primary text-gray-600 hover:text-primary cursor-pointer'
                                        : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    <span>{isToday(selectedDate) ? 'Choose Task' : 'History View'}</span>
                                    {isToday(selectedDate) && (
                                        <span className="bg-gray-100 group-hover:bg-purple-100 text-gray-500 group-hover:text-primary rounded-full w-5 h-5 flex items-center justify-center text-lg leading-none pb-0.5">+</span>
                                    )}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                        style={{ width: `${currentList.length > 0 ? (currentList.filter(t => t.status === 'approved').length / currentList.length) * 100 : 0}%` }}
                                    ></div>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-400">Task Completed: {currentList.filter(t => t.status === 'approved').length}/{currentList.length}</p>
                        </div>

                        {/* Calendar */}
                        <div className="bg-white rounded-2xl p-6 mt-6 border border-gray-100 shadow-sm relative overflow-hidden">
                            {/* Decorative Background Blob */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full -z-0 opacity-50"></div>

                            {/* Calendar Header with Dropdowns */}
                            <div className="flex justify-between items-center mb-6 text-sm font-semibold text-gray-700 relative z-10 px-2">
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
                                                const today = new Date();
                                                if (parseInt(e.target.value) === today.getFullYear() && newDate.getMonth() > today.getMonth()) {
                                                    newDate.setMonth(today.getMonth());
                                                }
                                                setSelectedDate(newDate);
                                            }}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {Array.from({ length: 2026 - 2024 + 1 }, (_, i) => 2024 + i).map(year => (
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
                                        const isFuture = day > now && !isToday;

                                        let attendanceColor = 'text-gray-700';
                                        if (isFuture) {
                                            attendanceColor = 'text-gray-300';
                                        } else {
                                            const hash = (day.getDate() + day.getMonth() * 31) % 7;
                                            if (hash <= 3) attendanceColor = 'bg-green-500 text-white shadow-sm';
                                            else if (hash === 4) attendanceColor = 'bg-yellow-400 text-white shadow-sm';
                                            else if (hash === 5) attendanceColor = 'bg-red-500 text-white shadow-sm';
                                            else attendanceColor = 'bg-gray-300 text-white';
                                        }

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

                {/* 2. Middle Panel (Task List) - Col Span 4 (LG) / 5 (XL) */}
                {/* 2. Middle Panel (Task List) - Compact: Span 4, Full: Span 5 */}
                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-5 flex flex-col h-full overflow-hidden min-h-0">
                    {viewMode === 'TASKS' ? (
                        <>
                            {/* Header */}
                            <div className="mb-4">
                                <h2 className="text-lg font-bold text-gray-800">Task List</h2>
                                <p className="text-sm text-gray-400">Today</p>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-3 min-h-0">
                                {currentList.length === 0 && <div className="text-center text-gray-400 py-10">No tasks found.</div>}
                                {currentList.map((task) => (
                                    <div key={task.task_id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition group">
                                        <div className="flex items-start gap-3">
                                            <div
                                                onClick={() => isToday(selectedDate) && handleToggleStatus(task)}
                                                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${task.status === 'approved' ? 'bg-purple-100 border-primary text-primary' : 'border-gray-300'
                                                    } ${(isToday(selectedDate)) ? 'cursor-pointer hover:border-primary' : 'cursor-default opacity-60'}`}
                                            >
                                                {task.status === 'approved' && <span className="font-bold text-xs">✓</span>}
                                            </div>
                                            <div className="flex-1">
                                                <p className={`text-sm font-medium ${task.status === 'approved' ? 'text-gray-800' : 'text-gray-600'}`}>{task.title}</p>
                                                <p className="text-[10px] text-gray-400 mt-1">Due: {new Date(task.due_at).toLocaleString()}</p>
                                                {task.note && <p className="text-[10px] text-gray-500 italic mt-0.5">"{task.note}"</p>}
                                            </div>
                                            <div className="flex flex-col gap-2 items-center">
                                                <button onClick={() => handleViewPhoto(task)} className="bg-primary text-white text-[10px] font-bold py-1.5 px-4 rounded-lg hover:bg-purple-700 transition shadow-sm flex items-center gap-1">
                                                    <Camera size={12} /> Foto
                                                </button>
                                                {/* Only allow deleting Crew's tasks */}
                                                {(isToday(selectedDate)) && (
                                                    <button onClick={() => handleDeleteTask(task.task_id)} className="text-red-400 hover:text-red-600 p-1 opacity-50 group-hover:opacity-100 transition">
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
                        /* Evaluation Mode View */
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
                                supervisor={crew}
                                targetDate={selectedDate}
                                onSuccess={() => fetchEvaluationStatus()}
                            />
                        )
                    )}
                </div>

                {/* 3. Right Panel (Activity) - Col Span 3 (LG) / 4 (XL) */}
                {/* 3. Right Panel (Activity) - Compact: Span 4, Full: Span 4 */}
                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-4 flex flex-col h-full ease-in-out duration-300 min-h-0">
                    {/* Render Logic: If Activity Mode OR Eval Mode -> Show Stats/Eval. Else (Preview/History) -> Show Preview/History */}
                    {(rightPanelMode === 'ACTIVITY' || viewMode === 'EVALUATION') ? (
                        viewMode === 'EVALUATION' ? (
                            <div className="h-full flex flex-col">
                                <div className="mb-4">
                                    <h2 className="text-lg font-bold text-gray-800 mb-2">
                                        {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </h2>

                                    {/* Monthly Activity Monitor */}
                                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 mb-4">
                                        <h3 className="text-sm font-semibold text-gray-600 mb-4">{selectedDate.toLocaleDateString('en-US', { month: 'long' })} Activity Monitor</h3>

                                        {evalStats?.activity_monitor && evalStats.activity_monitor.length > 0 ? (
                                            <>
                                                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex mb-4">
                                                    {evalStats.activity_monitor.map((item: any, idx: number) => (
                                                        <div key={idx} className={`h-full ${monitorColors[idx % monitorColors.length]}`} style={{ width: `${item.percentage}%` }}></div>
                                                    ))}
                                                </div>

                                                <div className="space-y-3">
                                                    {evalStats.activity_monitor.map((item: any, idx: number) => (
                                                        <div key={idx} className="flex items-center gap-3">
                                                            <div className={`w-3 h-3 rounded-full ${dotColors[idx % dotColors.length]}`}></div>
                                                            <span className="text-xs font-medium text-gray-600">{item.label} - {item.percentage}%</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-xs text-gray-400 italic">No activity data this month.</p>
                                        )}
                                    </div>

                                    {/* Result Card */}
                                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 mb-4 min-h-[100px] flex flex-col">
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                            POINT SIKAP KEPRIBADIAN Result ({selectedDate.toLocaleDateString('en-US', { month: 'long' })})
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                                                TOTAL POINT:
                                            </p>

                                            {todayEvaluation?.evaluated ? (
                                                <div className="flex items-center h-10">
                                                    <span className="font-bold text-3xl text-primary leading-none">
                                                        {todayEvaluation.data?.total_score}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center h-10 gap-2">
                                                    <span className="font-bold text-3xl text-gray-300 leading-none pb-1">-</span>
                                                    <span className="text-[10px] text-red-500 italic bg-red-50 px-2 py-1 rounded-md">
                                                        * Not yet submitted
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Yearly Overall Point */}
                                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">YEARLY OVERALL POINT</h3>
                                        <p className="text-sm font-medium text-gray-400 mb-1">Total Point :</p>
                                        <div className="text-6xl font-light text-black tracking-tighter">
                                            {evalStats?.yearly_score ?? '-'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // ACTIVITY MODE (Default)
                            <div className="flex flex-col h-full min-h-0">
                                <div className="mb-4 shrink-0">
                                    <h2 className="font-bold text-gray-800 text-lg">Activity</h2>
                                    <p className="text-sm text-gray-400">
                                        {selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                                <div className="space-y-4 flex-1 overflow-y-auto pr-2 min-h-0">
                                    {activityLogs.length > 0 ? (
                                        activityLogs.map((log: any, idx: number) => (
                                            <div key={log.id || idx} className="bg-gray-200 rounded-xl p-4 flex items-center justify-between">
                                                <span className="text-sm font-bold text-gray-700">{log.time}</span>
                                                <span className="text-sm font-medium text-gray-600">Crew - {log.role}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center text-gray-400 py-10 bg-gray-50 rounded-2xl">
                                            No activity logs for this date.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    ) : (
                        // PREVIEW / HISTORY MODE
                        rightPanelMode === 'HISTORY' ? (
                            <SubmissionHistory task={previewTask} onClose={handleClosePreview} />
                        ) : (
                            <TaskPreview
                                task={previewTask}
                                onClose={handleClosePreview}
                                onDeleteProof={handleDeleteProof}
                            />
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
