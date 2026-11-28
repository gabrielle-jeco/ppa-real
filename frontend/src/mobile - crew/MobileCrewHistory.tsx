import React, { useState, useEffect, useRef } from 'react';
import { Camera, Check, ChevronDown } from 'lucide-react';
import CrewLayout from './CrewLayout';
import TaskStartStatus from '../general/TaskStartStatus';
import MobileDraggableSheet from '../general/MobileDraggableSheet';
import { clampToTaskWindow, getAvailableTaskMonths, getAvailableTaskYears, isAfterTaskWindow } from '../utils/taskDateWindow';
import { markNotificationSeen, notifyOnce, notifyUpcomingTask } from '../utils/browserNotifications';
import { featureFlags } from '../utils/featureFlags';
import { formatTaskTitleWithArea } from '../utils/taskDisplay';

interface MobileCrewHistoryProps {
    user: any;
    onBack: () => void;
    onSelectTask: (task: any, selectedDate?: string) => void;
    refreshTrigger?: number;
    selectedRole: string;
    taskSource?: 'crew' | 'manager';
    title?: string;
    toolbar?: React.ReactNode;
}

export default function MobileCrewHistory({ user, onBack, onSelectTask, refreshTrigger, selectedRole, taskSource = 'crew', title = 'Riwayat', toolbar }: MobileCrewHistoryProps) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'ACTIVITY' | 'TASKS'>('TASKS'); // Default to TASKS for now
    const [showRoleDropdown, setShowRoleDropdown] = useState(false);

    // Real Data State
    const [tasks, setTasks] = useState<any[]>([]);
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const requestRef = useRef(0);

    const fetchData = async (silent = false) => {
        if (!user?.user_id) return;
        const requestId = ++requestRef.current;

        if (!silent) setLoading(true);
        try {
            const dateStr = selectedDate.toLocaleDateString('en-CA');
            const token = localStorage.getItem('auth_token') || '';

            const taskReq = fetch(taskSource === 'manager' ? `/api/supervisor/manager-tasks?date=${dateStr}` : `/api/crews/${user.user_id}/tasks?date=${dateStr}&role=${selectedRole}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });

            const activityReq = taskSource === 'crew' ? fetch(`/api/crew/activity-logs?date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            }) : Promise.resolve(null);

            const [taskRes, activityRes] = await Promise.all([taskReq, activityReq]);
            const taskData = taskRes.ok ? await taskRes.json() : [];
            const activityData = activityRes?.ok ? await activityRes.json() : [];
            if (requestId !== requestRef.current) return;

            if (taskRes.ok) {
                setTasks(taskSource === 'manager' ? taskData.map((task: any) => ({ ...task, task_id: task.id })) : taskData);
                setError('');
            } else {
                setTasks([]);
                if (taskSource === 'manager') setError('Gagal memuat tugas. Silakan pilih kembali tanggal riwayat.');
            }
            setActivityLogs(activityData);

        } catch (error) {
            console.error("Gagal mengambil data riwayat", error);
            if (requestId === requestRef.current && taskSource === 'manager') {
                setTasks([]);
                setActivityLogs([]);
                setError('Gagal memuat tugas. Silakan pilih kembali tanggal riwayat.');
            }
        } finally {
            if (requestId === requestRef.current) setLoading(false);
        }
    };

    // Fetch Tasks & Activities
    useEffect(() => {
        const requestCounter = requestRef;
        fetchData();
        return () => { requestCounter.current++; };
    }, [selectedDate, user?.user_id, refreshTrigger, selectedRole, taskSource]);

    useEffect(() => {
        if (!user?.user_id) return;

        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') fetchData(true);
        }, 60000);
        return () => window.clearInterval(timer);
    }, [selectedDate, user?.user_id, selectedRole, taskSource]);

    useEffect(() => {
        if (taskSource !== 'manager' || tasks.length === 0 || !user?.user_id) return;

        const dateStr = selectedDate.toLocaleDateString('en-CA');
        if (dateStr !== new Date().toLocaleDateString('en-CA')) return;

        const prefix = 'manager';
        const seenKey = `${prefix}_seen_tasks_${user.user_id}_${selectedRole}_${dateStr}`;
        const previousSeen = JSON.parse(localStorage.getItem(seenKey) || 'null') as number[] | null;
        const currentIds = tasks.map(task => Number(task.task_id)).filter(Boolean);

        if (!previousSeen) {
            localStorage.setItem(seenKey, JSON.stringify(currentIds));
            currentIds.forEach(taskId => markNotificationSeen(`${prefix}_new_task_${taskId}`));
        } else {
            tasks
                .filter(task => !previousSeen.includes(Number(task.task_id)))
                .forEach(task => notifyOnce(`${prefix}_new_task_${task.task_id}`, 'Pekerjaan Baru', {
                    body: task.title || 'Ada pekerjaan baru yang perlu dikerjakan.',
                    tag: `${prefix}-new-task-${task.task_id}`,
                }));

            localStorage.setItem(seenKey, JSON.stringify(Array.from(new Set([...previousSeen, ...currentIds]))));
        }

        tasks.forEach(task => notifyUpcomingTask(task, prefix));
    }, [tasks, selectedDate, selectedRole, user?.user_id, taskSource]);

    const isFutureDate = (date: Date) => isAfterTaskWindow(date);

    const getAvailableMonths = (year: number) => {
        return getAvailableTaskMonths(year);
    };

    const buildClampedDate = (year: number, month: number, day: number) => {
        const maxDay = new Date(year, month + 1, 0).getDate();
        return clampToTaskWindow(new Date(year, month, Math.min(day, maxDay)));
    };

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedDate(buildClampedDate(selectedDate.getFullYear(), parseInt(e.target.value), selectedDate.getDate()));
    };

    const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedDate(buildClampedDate(parseInt(e.target.value), selectedDate.getMonth(), selectedDate.getDate()));
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

    const completedCount = tasks.filter(task => task.status === 'approved').length;

    return (
        <CrewLayout
            title={title}
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
                                            {new Date(0, i).toLocaleString('id-ID', { month: 'long' })}
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
                                    {getAvailableTaskYears().map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 text-center mb-2 border-b border-gray-100 pb-2">
                        {['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'].map(day => (
                            <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-y-1 justify-items-center">
                        {renderCalendar()}
                    </div>
                </div>

                {toolbar && <div className="mb-4 shrink-0">{toolbar}</div>}
                {error && <p role="alert" className="mb-3 text-xs text-red-500">{error}</p>}
                {/* List Card */}
                <MobileDraggableSheet
                    className="bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.03)] flex-1 flex flex-col min-h-0 relative -mx-2 px-4 pt-4"
                    handleClassName="mb-2 shrink-0"
                >

                    <div className="flex justify-between items-center mb-4 sticky top-0 bg-white py-1 z-10 w-full shrink-0">
                        <h3 className="font-bold text-gray-800 text-sm">
                            {selectedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
                        </h3>
                        {taskSource === 'crew' && <><span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg capitalize">
                            {selectedRole}
                        </span>

                        <div className="relative">
                            <button
                                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                                className="flex items-center gap-2 text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95 transition"
                            >
                                {viewMode === 'ACTIVITY' ? 'Log Aktivitas' : 'Riwayat Pekerjaan'}
                                <ChevronDown size={14} className={`transition ${showRoleDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {showRoleDropdown && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl z-20 overflow-hidden border border-gray-100 animate-slide-in">
                                    <button
                                        onClick={() => { setViewMode('ACTIVITY'); setShowRoleDropdown(false); }}
                                        className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-gray-50 flex items-center justify-between ${viewMode === 'ACTIVITY' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
                                    >
                                        Log Aktivitas
                                        {viewMode === 'ACTIVITY' && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                                    </button>
                                    <button
                                        onClick={() => { setViewMode('TASKS'); setShowRoleDropdown(false); }}
                                        className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-gray-50 flex items-center justify-between ${viewMode === 'TASKS' ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
                                    >
                                        Riwayat Pekerjaan
                                        {viewMode === 'TASKS' && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                                    </button>
                                </div>
                            )}
                        </div></>}
                        {taskSource === 'manager' && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                                {completedCount}/{tasks.length} Selesai
                            </span>
                        )}
                    </div>

                    <div className="overflow-y-auto flex-1 pb-20 -mx-2 px-2 space-y-3">
                        {viewMode === 'ACTIVITY' ? (
                            activityLogs.length > 0 ? (
                                activityLogs.map((log, idx) => (
                                    <div key={idx} className="bg-gray-100/50 rounded-2xl p-4 flex items-center justify-between border border-transparent hover:border-gray-200 transition">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-gray-800 font-bold text-sm capitalize">{log.role}</span>
                                            <span className="text-gray-400 text-[10px] italic capitalize">{log.action ? log.action.replace('_', ' ') : 'Ganti Peran'}</span>
                                        </div>
                                        <span className="text-gray-500 text-xs font-semibold bg-white px-2 py-1 rounded-lg shadow-sm border border-gray-100">{log.time}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-400 text-xs">
                                    Belum ada aktivitas pada tanggal ini.
                                </div>
                            )
                        ) : loading ? (
                            <div className="flex justify-center py-10 text-gray-400">Memuat pekerjaan...</div>
                        ) : (
                            tasks.length > 0 ? (
                                tasks.map((task) => (
                                    <div
                                        key={task.task_id}
                                        className="bg-gray-100/50 rounded-2xl p-4 flex items-center justify-between gap-3 border border-transparent hover:border-gray-200 transition"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${task.status === 'approved' ? 'bg-blue-100 border-blue-500 text-blue-600' : 'border-gray-300 bg-white'}`}>
                                                {task.status === 'approved' && <Check size={14} strokeWidth={3} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-gray-800 text-sm leading-tight mb-0.5">{formatTaskTitleWithArea(task)}</p>
                                                <p className={`text-[10px] text-blue-600 font-bold mb-0.5 ${taskSource === 'manager' ? 'whitespace-pre-wrap break-words' : 'capitalize'}`}>{taskSource === 'manager' ? `Target: ${task.target}` : `Kategori: ${task.work_station?.name || 'Umum'}`}</p>
                                                <TaskStartStatus
                                                    task={task}
                                                    scheduleClassName="text-[10px] text-gray-400 mb-0.5"
                                                    statusClassName="text-[10px] text-amber-500 font-semibold mb-0.5"
                                                />
                                                <p className="text-[10px] text-gray-400 mb-0.5">Tenggat {new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                {taskSource === 'manager' && (task.note || task.description) && (
                                                    <div className="text-[10px] text-gray-500 leading-snug whitespace-pre-line break-words">
                                                        {task.note || task.description}
                                                    </div>
                                                )}
                                                {taskSource === 'crew' && featureFlags.taskWeight && (
                                                    <p className="text-[10px] text-gray-400 capitalize">Bobot {task.weight_label || 'mudah'} ({task.weight_value || 2})</p>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onSelectTask(task, selectedDate.toLocaleDateString('en-CA'))}
                                            className="bg-blue-600 text-white shadow-blue-200 text-[10px] font-bold py-2 px-4 rounded-xl shadow-md active:scale-95 transition-transform flex items-center gap-1"
                                        >
                                            <Camera size={14} />
                                            {taskSource === 'manager' ? 'Bukti' : 'Foto'}
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-400 text-xs">
                                    Belum ada pekerjaan pada tanggal ini.
                                </div>
                            )
                        )}
                        <div className="h-4"></div>
                    </div>
                </MobileDraggableSheet>
            </div>
        </CrewLayout>
    );
}
