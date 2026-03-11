import React, { useState, useEffect } from 'react';
import { ChevronDown, Camera, Trash2 } from 'lucide-react';
import MobileLayout from './MobileLayout';
import MobileTaskPreview from './MobileTaskPreview';
import MobileEvidenceListModal from '../mobile - crew/MobileEvidenceListModal';

interface MobileCrewHistoryProps {
    crew: any;
    onBack: () => void;
}

export default function MobileCrewHistory({ crew, onBack }: MobileCrewHistoryProps) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'ACTIVITY' | 'TASKS'>('TASKS');
    const [showRoleDropdown, setShowRoleDropdown] = useState(false);

    // Preview State
    const [previewTask, setPreviewTask] = useState<any>(null);
    const [isEvidenceListOpen, setIsEvidenceListOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed

    const isFutureDate = (date: Date) => {
        return date > today;
    };

    const getAvailableMonths = (year: number) => {
        if (year === currentYear) {
            return Array.from({ length: currentMonth + 1 }, (_, i) => i);
        }
        return Array.from({ length: 12 }, (_, i) => i);
    };

    // Real Data State
    const [tasks, setTasks] = useState<any[]>([]); // For Task History
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Fetch Tasks & Activities
    useEffect(() => {
        const fetchData = async () => {
            if (!crew?.id) return;

            setLoading(true);
            try {
                const dateStr = selectedDate.toLocaleDateString('en-CA');
                const token = localStorage.getItem('auth_token') || '';

                const taskReq = fetch(`/api/crews/${crew.id}/tasks?date=${dateStr}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const activityReq = fetch(`/api/crew/activity-logs?date=${dateStr}&user_id=${crew.id}`, {
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
    }, [selectedDate, viewMode, crew?.id]);

    const isToday = (date: Date) => {
        const todayDate = new Date();
        return date.getDate() === todayDate.getDate() &&
            date.getMonth() === todayDate.getMonth() &&
            date.getFullYear() === todayDate.getFullYear();
    };

    const handleUpdateStatus = async (taskId: number, newStatus: string) => {
        setTasks(tasks.map(t => t.task_id === taskId ? { ...t, status: newStatus } : t));
        if (previewTask?.task_id === taskId) {
            setPreviewTask({ ...previewTask, status: newStatus });
        }
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`/api/tasks/${taskId}/status`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
        } catch (error) {
            console.error("Status update failed", error);
            // Optionally could re-fetch tasks here on failure
        }
    };

    const handleToggleStatus = async (task: any) => {
        const newStatus = task.status === 'approved' ? 'pending' : 'approved';
        handleUpdateStatus(task.task_id, newStatus);
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
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    const handleDeleteProof = async (evidenceId: number) => {
        if (!previewTask) return;
        const taskId = previewTask.task_id;
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) throw new Error("No token found");

            const res = await fetch(`/api/tasks/${taskId}/evidence`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ evidence_id: evidenceId })
            });

            if (res.ok) {
                setTasks(tasks.map(t => t.task_id === taskId ? {
                    ...t,
                    evidences: (t.evidences || []).filter((e: any) => e.id !== evidenceId)
                } : t));
                setPreviewTask({
                    ...previewTask,
                    evidences: (previewTask.evidences || []).filter((e: any) => e.id !== evidenceId)
                });
            } else {
                alert('Failed to delete image.');
            }
        } catch (error) {
            console.error('Error deleting image:', error);
            alert('An error occurred.');
        }
    };
    const [activeEvidenceTab, setActiveEvidenceTab] = useState<'before' | 'after'>('before');
    const [initialPreviewIndex, setInitialPreviewIndex] = useState(0);

    const handleViewPhoto = (task: any) => {
        setPreviewTask(task);
        setIsEvidenceListOpen(true);
    };

    // Calendar Logic
    const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

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

    const renderCalendar = () => {
        const daysInMonth = getDaysInMonth(selectedDate);
        const firstDay = getFirstDayOfMonth(selectedDate);
        const days = [];

        // Empty slots
        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8 md:h-9"></div>);

        // Days
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
        <MobileLayout
            title={crew.name}
            onBack={onBack}
            allowScroll={false}
        >
            <MobileEvidenceListModal
                isOpen={isEvidenceListOpen}
                onClose={() => setIsEvidenceListOpen(false)}
                task={previewTask}
                onSelectImage={(type, index = 0) => {
                    setActiveEvidenceTab(type as 'before' | 'after');
                    setInitialPreviewIndex(index);
                    setIsPreviewOpen(true);
                }}
                onDelete={!isToday(selectedDate) ? undefined : (evidenceId) => handleDeleteProof(evidenceId)}
                readOnly={previewTask?.status === 'approved' || !isToday(selectedDate)}
            />

            <MobileTaskPreview
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                task={previewTask}
                activeTab={activeEvidenceTab}
                onTabChange={setActiveEvidenceTab}
                initialIndex={initialPreviewIndex}
                onDeleteProof={(evidenceId) => handleDeleteProof(evidenceId)}
                onUpdateStatus={(status) => handleUpdateStatus(previewTask?.task_id, status)}
                readOnly={previewTask?.status === 'approved' || !isToday(selectedDate)}
            />

            <div className="flex flex-col h-full">
                {/* Subtitle */}
                <p className="text-center text-gray-500 text-xs font-medium mb-3 opacity-80 mt-[-10px]">History</p>

                {/* Calendar Card */}
                <div className="bg-white rounded-3xl shado-sm p-5 mb-4 flex-shrink-0 relative">

                    {/* Month/Year Selection (Desktop Style) */}
                    <div className="flex justify-between items-center mb-4 px-1">
                        <div className="flex items-center justify-between w-full gap-2">
                            {/* Month Select */}
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

                            {/* Year Select */}
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

                    {/* Day Names */}
                    <div className="grid grid-cols-7 text-center mb-2 border-b border-gray-100 pb-2">
                        {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(day => (
                            <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                        ))}
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-y-1 justify-items-center">
                        {renderCalendar()}
                    </div>
                </div>

                {/* List Card - Matches MobileCrewDetail Structure */}
                <div className="bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.03)] flex-1 flex flex-col min-h-0 relative -mx-2 px-4 pt-4">

                    {/* Handle Bar Wrapper */}
                    <div className="flex justify-center mb-2 shrink-0">
                        <div className="w-12 h-1.5 bg-blue-600 rounded-full"></div>
                    </div>

                    {/* List Header & Dropdown */}
                    <div className="flex justify-between items-center mb-4 sticky top-0 bg-white py-1 z-10 w-full shrink-0">
                        <h3 className="font-bold text-gray-800 text-sm">
                            {selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}
                        </h3>

                        {/* Role Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                                className="flex items-center gap-2 text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95 transition"
                            >
                                {viewMode === 'ACTIVITY' ? 'Activity Log' : 'Task History'}
                                <ChevronDown size={14} className={`transition ${showRoleDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown Menu */}
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


                    {/* Scrollable Content List */}
                    <div className="overflow-y-auto flex-1 pb-20 -mx-2 px-2 space-y-3">
                        {viewMode === 'ACTIVITY' ? (
                            // Activity Logs
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
                        ) : (
                            // Task History
                            tasks.length > 0 ? (
                                tasks.map((task) => {
                                    const isApproved = task.status === 'approved';
                                    const isPastDue = !isToday(selectedDate);

                                    return (
                                        <div key={task.task_id} className="bg-gray-100/50 rounded-2xl p-4 flex items-center justify-between group border border-transparent hover:border-gray-200 transition">
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                <div
                                                    onClick={() => !isPastDue && handleToggleStatus(task)}
                                                    className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${isApproved ? 'bg-blue-100 border-blue-500 text-blue-600' : isPastDue ? 'border-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-300 bg-white hover:border-blue-500'}`}
                                                >
                                                    {isApproved && <span className="font-bold text-xs">✓</span>}
                                                </div>
                                                <div className="flex-1 min-w-0 pr-2">
                                                    <p className={`font-bold text-sm line-clamp-1 mb-0.5 ${isApproved ? 'text-gray-500' : 'text-gray-800'}`}>{task.title}</p>
                                                    <p className="text-[10px] text-gray-400">{new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                    {task.note && <div className="text-[10px] text-gray-500 italic truncate">{task.note}</div>}
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2 items-end">
                                                <button
                                                    onClick={() => handleViewPhoto(task)}
                                                    className="bg-blue-600 text-white shadow-blue-200 text-[10px] font-bold py-2 px-4 rounded-xl shadow-md active:scale-95 transition-transform flex items-center gap-1"
                                                >
                                                    <Camera size={14} />
                                                    Foto
                                                </button>
                                                {(!isPastDue && !isApproved) && (
                                                    <button
                                                        onClick={() => handleDeleteTask(task.task_id)}
                                                        className="text-red-300 hover:text-red-500 p-1 transition"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="text-center py-8 text-gray-400 text-xs">
                                    No tasks recorded for this date.
                                </div>
                            )
                        )}

                        {/* Safe Area Padding */}
                        <div className="h-4"></div>
                    </div>

                </div>
            </div>
        </MobileLayout >
    );
}
