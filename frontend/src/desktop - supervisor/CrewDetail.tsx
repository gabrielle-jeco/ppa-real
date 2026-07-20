import React, { useState, useEffect } from 'react';
import { Camera, Trash2, ChevronDown, CheckCircle, XCircle, Ban, Edit3 } from 'lucide-react';
import AddTaskModal from '../general/AddTaskModal';
import BulkTaskModal from '../general/BulkTaskModal';
import TaskPreview from '../general/TaskPreview';
import EvaluationForm from '../general/EvaluationForm';
import SubmissionHistory from './SubmissionHistory';
import TaskStartStatus from '../general/TaskStartStatus';
import { getAttendanceColor, getAttendanceDay } from '../utils/attendanceCalendar';
import { canAssignTaskOnDate, clampToTaskWindow, getAvailableTaskMonths, getAvailableTaskYears, isAfterTaskWindow } from '../utils/taskDateWindow';
import { isTaskNotStarted } from '../utils/taskTiming';
import { notifyApprovalGrace } from '../utils/browserNotifications';

interface CrewDetailProps {
    crew: any;
    crews?: any[];
    onTaskChange?: () => void;
}

export default function CrewDetail({ crew, crews = [], onTaskChange }: CrewDetailProps) {
    const [tasks, setTasks] = useState<any[]>([]);

    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isBulkTaskModalOpen, setIsBulkTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<any>(null);
    const [editingBatch, setEditingBatch] = useState<any>(null);

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

    useEffect(() => {
        if (!crew?.id) return;

        const timer = window.setInterval(() => {
            fetchTasks();
            if (rightPanelMode === 'ACTIVITY') {
                fetchActivityLogs();
            }
        }, 15000);

        return () => window.clearInterval(timer);
    }, [crew?.id, selectedDate, rightPanelMode]);

    useEffect(() => {
        tasks.forEach(notifyApprovalGrace);
    }, [tasks]);

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
            console.error("Gagal mengambil tugas", error);
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
            console.error("Gagal memeriksa evaluasi", error);
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
            console.error("Gagal mengambil log aktivitas", error);
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
            console.error("Gagal mengambil statistik evaluasi", error);
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
                    supervisor_id: crew.id,
                    ...taskData
                })
            });
            if (res.ok) {
                fetchTasks();
                onTaskChange?.();
            }
        } catch (error) {
            console.error("Gagal menambahkan tugas", error);
        }
    };

    const handleBulkAddTask = async (taskData: any) => {
        try {
            const token = localStorage.getItem('auth_token');
            const isEditingBatch = Boolean(editingBatch?.id);
            const res = await fetch(isEditingBatch ? `/api/task-batches/${editingBatch.id}` : '/api/tasks/bulk', {
                method: isEditingBatch ? 'PATCH' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            });
            if (res.ok) {
                setEditingBatch(null);
                fetchTasks();
                onTaskChange?.();
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.message || (isEditingBatch ? 'Gagal memperbarui penugasan massal.' : 'Gagal membuat penugasan massal.'));
            }
        } catch (error) {
            console.error("Gagal membuat penugasan massal", error);
        }
    };

    const handleUpdateTask = async (taskData: any) => {
        if (!editingTask) return;
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/tasks/${editingTask.task_id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            });
            if (res.ok) {
                setEditingTask(null);
                fetchTasks();
                onTaskChange?.();
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.message || 'Gagal memperbarui tugas.');
            }
        } catch (error) {
            console.error("Gagal memperbarui tugas", error);
        }
    };

    const handleDeleteTask = async (taskId: number) => {
        if (!window.confirm("Hapus tugas ini?")) return;
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`/api/tasks/${taskId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchTasks();
            onTaskChange?.();
        } catch (error) {
            console.error("Gagal menghapus tugas", error);
        }
    };

    const handleToggleStatus = async (task: any) => {
        if (!canApproveTask(task)) {
            return;
        }

        const newStatus = task.status === 'approved' ? 'pending' : 'approved';
        setTasks(tasks.map(t => t.task_id === task.task_id ? { ...t, status: newStatus } : t));

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
            onTaskChange?.();
        } catch (error) {
            console.error("Gagal memperbarui status", error);
            fetchTasks();
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
                alert('Gagal menghapus foto.');
            }
        } catch (error) {
            console.error("Gagal menghapus bukti", error);
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

    const isTaskPastDue = (task: any) => new Date(task.due_at) < new Date();
    const canApproveTask = (task: any) => addApprovalGraceDay(new Date(task.due_at)).getTime() >= Date.now();

    const addApprovalGraceDay = (date: Date) => {
        const result = new Date(date);
        result.setHours(result.getHours() + 24);
        return result;
    };

    const canEditTask = (task: any) => (
        (task.assignment_type || 'individual') === 'individual'
        && task.status !== 'approved'
        && (task.evidences || []).length === 0
        && !isTaskPastDue(task)
    );
    const canEditBatchTask = (task: any) => (
        (task.assignment_type || 'individual') !== 'individual'
        && task.assignment_batch
        && task.status !== 'approved'
        && (task.evidences || []).length === 0
        && !isTaskPastDue(task)
    );
    const closeBulkTaskModal = () => {
        setIsBulkTaskModalOpen(false);
        setEditingBatch(null);
    };
    const openBulkTaskModal = () => {
        setEditingBatch(null);
        setIsBulkTaskModalOpen(true);
    };
    const openBatchEditor = (batch: any) => {
        setIsBulkTaskModalOpen(false);
        setEditingBatch(batch);
    };

    const isCurrentSelectedMonth =
        selectedDate.getFullYear() === new Date().getFullYear() &&
        selectedDate.getMonth() === new Date().getMonth();
    const activityMonitorTitle = `${selectedDate.toLocaleDateString('id-ID', { month: 'long' })} Monitoring Aktivitas${isCurrentSelectedMonth ? ' (Bulanan)' : ''}`;

    const getAttendancePeriodLabel = () => {
        const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        const endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
        return `${startDate.toLocaleDateString('id-ID')} S/D ${endDate.toLocaleDateString('id-ID')}`;
    };

    const attendanceSummary = (() => {
        const calendar = evalStats?.attendance_calendar || [];
        const summary = {
            total: calendar.length,
            noAttendance: 0,
            notYet: 0,
            present: 0,
            sick: 0,
            permit: 0,
            late: 0,
            leave: 0,
            off: 0,
        };

        calendar.forEach((day: any) => {
            const code = String(day?.status_code || '').trim().toUpperCase();
            const dayDate = day?.date ? new Date(`${day.date}T00:00:00`) : null;
            const isFutureDay = dayDate ? dayDate > new Date() : day?.source === 'future';

            if (day?.source === 'future' || isFutureDay) {
                summary.notYet += 1;
                return;
            }

            if (!code || day?.source === 'fallback') {
                summary.noAttendance += 1;
                return;
            }

            if (['H', 'HADIR', 'CORRECTION'].includes(code)) summary.present += 1;
            else if (['T', 'TELAT', 'LATE'].includes(code)) summary.late += 1;
            else if (['S', 'SAKIT', 'SD'].includes(code)) summary.sick += 1;
            else if (['I', 'IZIN', 'PS'].includes(code)) summary.permit += 1;
            else if (['C', 'CUTI'].includes(code)) summary.leave += 1;
            else if (['OFF', 'L', 'LIBUR'].includes(code)) summary.off += 1;
            else summary.noAttendance += 1;
        });

        return summary;
    })();

    const attendanceColumns = [
        { label: 'TOTAL HARI', value: attendanceSummary.total },
        { label: 'TIDAK ADA ABSEN', value: attendanceSummary.noAttendance },
        { label: 'BELUM ABSEN', value: attendanceSummary.notYet },
        { label: 'HADIR', value: attendanceSummary.present },
        { label: 'SAKIT', value: attendanceSummary.sick },
        { label: 'IZIN', value: attendanceSummary.permit },
        { label: 'TELAT', value: attendanceSummary.late },
        { label: 'CUTI', value: attendanceSummary.leave },
        { label: 'OFF', value: attendanceSummary.off },
    ];

    // Activity Monitor colors for bar chart
    const monitorColors = ['bg-green-400', 'bg-purple-500', 'bg-blue-400', 'bg-yellow-400', 'bg-red-400', 'bg-pink-400'];
    const dotColors = ['bg-green-400', 'bg-purple-500', 'bg-blue-400', 'bg-yellow-400', 'bg-red-400', 'bg-pink-400'];

    const currentList = tasks;
    const canAssignOnSelectedDate = canAssignTaskOnDate(selectedDate);
    const getEvaluationStatusView = () => {
        if (todayEvaluation?.evaluated) {
            return {
                Icon: CheckCircle,
                iconWrapClass: 'bg-green-100 text-green-600',
                iconClass: 'text-green-600',
                title: 'Evaluasi Selesai',
                message: 'Form evaluasi bulanan untuk bulan ini sudah diisi.',
            };
        }

        const selectedPeriod = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        const currentPeriod = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const isPastPeriod = selectedPeriod < currentPeriod;

        if (isPastPeriod) {
            return {
                Icon: XCircle,
                iconWrapClass: 'bg-red-100 text-red-500',
                iconClass: 'text-red-500',
                title: 'Evaluasi Terlewat',
                message: todayEvaluation?.locked_message || 'Periode evaluasi sudah ditutup dan tidak dapat diisi lagi.',
            };
        }

        return {
            Icon: Ban,
            iconWrapClass: 'bg-amber-100 text-amber-500',
            iconClass: 'text-amber-500',
            title: 'Evaluasi Belum Dibuka',
            message: todayEvaluation?.locked_message || 'Evaluasi bulanan belum masuk periode pengisian.',
        };
    };
    const evaluationStatusView = getEvaluationStatusView();
    const EvaluationStatusIcon = evaluationStatusView.Icon;

    return (
        <div className="flex flex-col h-full bg-gray-50 p-6 overflow-hidden relative">
            <AddTaskModal
                isOpen={isTaskModalOpen}
                onClose={() => setIsTaskModalOpen(false)}
                onSubmit={handleAddTask}
                defaultDate={selectedDate.toLocaleDateString('en-CA')}
                requireCategory
            />
            <AddTaskModal
                isOpen={!!editingTask}
                onClose={() => setEditingTask(null)}
                onSubmit={handleUpdateTask}
                defaultDate={selectedDate.toLocaleDateString('en-CA')}
                requireCategory
                initialTask={editingTask}
                submitLabel="Simpan Perubahan"
            />
            <BulkTaskModal
                isOpen={isBulkTaskModalOpen || !!editingBatch}
                onClose={closeBulkTaskModal}
                onSubmit={handleBulkAddTask}
                defaultDate={selectedDate.toLocaleDateString('en-CA')}
                crews={crews.map((item) => ({ id: item.id, name: item.name }))}
                initialBatch={editingBatch}
                submitLabel={editingBatch ? 'Simpan Perubahan' : 'Buat Penugasan'}
            />

            <div className="items-center justify-between hidden lg:flex mb-6"></div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-full flex-1 min-h-0">

                {/* 1. Left Panel (Profile & Calendar) - Col Span 5 (LG) / 3 (XL) */}
                {/* 1. Left Panel (Profile & Calendar) - Compact: Span 4, Full: Span 3 */}
                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-3 flex flex-col gap-4 lg:gap-6 h-full overflow-y-auto pr-2 min-h-0">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-primary mb-1">{crew.name}</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            Peran sebagai <span className="underline decoration-primary">{crew.current_workstation ? `Crew - ${crew.current_workstation}` : crew.role || 'Crew'}</span> <br />
                            Hari ini
                        </p>
                        <button
                            onClick={() => handleSetViewMode('EVALUATION')}
                            className={`text-xs font-bold py-2 px-6 rounded-full transition w-full shadow-md ${viewMode === 'EVALUATION'
                                ? 'bg-purple-100 text-primary border-2 border-primary'
                                : 'bg-primary text-white border-2 border-transparent hover:bg-purple-700'
                                }`}
                        >
                            Evaluasi
                        </button>
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">Aktivitas & Tugas</h3>
                            <button
                                onClick={() => handleSetViewMode('TASKS')}
                                className={`text-[10px] font-bold py-1 px-3 rounded-full transition border ${viewMode === 'TASKS'
                                    ? 'bg-purple-100 text-primary border-primary'
                                    : 'bg-primary text-white border-transparent hover:bg-purple-700'
                                    }`}
                            >
                                Lihat
                            </button>
                        </div>

                        <div className="mb-0">
                            <h4 className="font-bold text-gray-800 text-sm mb-3">Tugas</h4>
                            <div className="relative mb-3 grid grid-cols-[1fr_auto] gap-2">
                                <button
                                    onClick={() => setIsTaskModalOpen(true)}
                                    disabled={!canAssignOnSelectedDate}
                                    className={`h-12 border rounded-lg px-4 flex items-center justify-between text-xs font-semibold shadow-sm transition group ${canAssignOnSelectedDate
                                        ? 'bg-white border-gray-200 hover:border-primary text-gray-600 hover:text-primary cursor-pointer'
                                        : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    <span>{canAssignOnSelectedDate ? 'Tambah Tugas' : 'Lihat Riwayat'}</span>
                                    {canAssignOnSelectedDate && (
                                        <span className="bg-gray-100 group-hover:bg-purple-100 text-gray-500 group-hover:text-primary rounded-full w-5 h-5 flex items-center justify-center text-lg leading-none pb-0.5">+</span>
                                    )}
                                </button>
                                <button
                                    onClick={openBulkTaskModal}
                                    disabled={!canAssignOnSelectedDate}
                                    className={`h-12 px-4 rounded-lg text-xs font-bold shadow-sm transition ${canAssignOnSelectedDate
                                        ? 'bg-primary text-white hover:bg-purple-700'
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    Massal
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
                            <p className="text-[10px] text-gray-400">Tugas Selesai: {currentList.filter(t => t.status === 'approved').length}/{currentList.length}</p>
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
                                                setSelectedDate(clampToTaskWindow(newDate));
                                            }}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl px-3 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {Array.from({ length: 12 }, (_, i) => i)
                                                .filter(m => getAvailableTaskMonths(selectedDate.getFullYear()).includes(m))
                                                .map(i => (
                                                    <option key={i} value={i} className="text-sm">
                                                        {new Date(0, i).toLocaleString('id-ID', { month: 'long' })}
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
                                                setSelectedDate(clampToTaskWindow(newDate));
                                            }}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {getAvailableTaskYears().map(year => (
                                                <option key={year} value={year} className="text-sm">{year}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-primary transition-colors" />
                                    </div>
                                </div>
                            </div>


                            <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 font-medium uppercase tracking-wider gap-y-4 mb-2 relative z-10">
                                <span>MIN</span><span>SEN</span><span>SEL</span><span>RAB</span><span>KAM</span><span>JUM</span><span>SAB</span>
                            </div>
                            <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-700 gap-y-3 relative z-10">
                                {getCalendarDays().map((day, idx) => {
                                    if (!day) return <div key={idx}></div>;

                                    // Evaluation Mode: Attendance View
                                    if (viewMode === 'EVALUATION') {
                                        const now = new Date();
                                        const isToday = day.getDate() === now.getDate() && day.getMonth() === now.getMonth() && day.getFullYear() === now.getFullYear();
                                        const isFuture = day > now && !isToday;

                                        const attendanceDay = getAttendanceDay(evalStats?.attendance_calendar, day);
                                        const attendanceColor = getAttendanceColor(attendanceDay?.status_code, isFuture);

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
                                    const isUnavailable = isAfterTaskWindow(day);

                                    return (
                                        <div key={idx} className="flex justify-center">
                                            <button
                                                onClick={() => {
                                                    if (!isUnavailable) setSelectedDate(day);
                                                }}
                                                disabled={isUnavailable}
                                                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] transition ${isSelected
                                                    ? 'bg-primary text-white shadow-md transform scale-110'
                                                    : isUnavailable
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
                                    <h2 className="text-lg font-bold text-gray-800">Daftar Pekerjaan</h2>
                                <p className="text-sm text-gray-400">Hari ini</p>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-3 min-h-0">
                                {currentList.length === 0 && <div className="text-center text-gray-400 py-10">Tidak ada tugas.</div>}
                                {currentList.map((task) => (
                                    <div key={task.task_id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition group">
                                        <div className="flex items-start gap-3">
                                            <div
                                                onClick={() => canApproveTask(task) && handleToggleStatus(task)}
                                                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${task.status === 'approved' ? 'bg-purple-100 border-primary text-primary' : 'border-gray-300'
                                                    } ${canApproveTask(task) ? 'cursor-pointer hover:border-primary' : 'cursor-default opacity-60'}`}
                                            >
                                                {task.status === 'approved' && <CheckCircle size={14} strokeWidth={3} />}
                                            </div>
                                            <div className="flex-1">
                                                <p className={`text-sm font-medium ${task.status === 'approved' ? 'text-gray-800' : 'text-gray-600'}`}>{task.title}</p>
                                                <p className="text-[10px] text-primary font-semibold capitalize mt-1">Kategori: {task.work_station?.name || 'Umum'}</p>
                                                <TaskStartStatus
                                                    task={task}
                                                    scheduleClassName="text-[10px] text-gray-400 mt-1"
                                                    statusClassName="text-[10px] text-amber-500 font-semibold mt-1"
                                                />
                                                <p className="text-[10px] text-gray-400 mt-1">Tenggat: {new Date(task.due_at).toLocaleString('id-ID')}</p>
                                                <p className="text-[10px] text-gray-400 mt-1 capitalize">
                                                    Bobot: {task.weight_label || 'mudah'} ({task.weight_value || 2})
                                                    {task.assignment_type && task.assignment_type !== 'individual' ? ` - ${task.assignment_type}` : ''}
                                                </p>
                                                {task.note && <p className="text-[10px] text-gray-500 leading-snug whitespace-pre-line break-words mt-0.5">{task.note}</p>}
                                            </div>
                                            <div className="flex flex-col gap-2 items-center">
                                                <button onClick={() => handleViewPhoto(task)} className="bg-primary text-white text-[10px] font-bold py-1.5 px-4 rounded-lg hover:bg-purple-700 transition shadow-sm flex items-center gap-1">
                                                    <Camera size={12} /> Foto
                                                </button>
                                                {(!isTaskPastDue(task) && task.status !== 'approved') && (
                                                    <button onClick={() => handleDeleteTask(task.task_id)} className="text-red-400 hover:text-red-600 p-1 opacity-50 group-hover:opacity-100 transition">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                                {canEditTask(task) && (
                                                    <button onClick={() => setEditingTask(task)} className="text-gray-400 hover:text-primary p-1 opacity-50 group-hover:opacity-100 transition" title="Edit tugas">
                                                        <Edit3 size={14} />
                                                    </button>
                                                )}
                                                {canEditBatchTask(task) && (
                                                    <button onClick={() => openBatchEditor(task.assignment_batch)} className="text-gray-400 hover:text-primary p-1 opacity-50 group-hover:opacity-100 transition" title="Edit penugasan massal">
                                                        <Edit3 size={14} />
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
                        (todayEvaluation?.evaluated || todayEvaluation?.is_locked || todayEvaluation?.can_evaluate === false) ? (
                            <div className="flex flex-col items-center justify-center h-full bg-white rounded-2xl p-8 border border-gray-100 text-center">
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${evaluationStatusView.iconWrapClass}`}>
                                    <EvaluationStatusIcon size={46} strokeWidth={2.5} className={evaluationStatusView.iconClass} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 mb-2">{evaluationStatusView.title}</h3>
                                <p className="text-gray-500 mb-6">{evaluationStatusView.message}</p>
                                <div className="bg-purple-50 p-4 rounded-xl w-full max-w-xs mb-6">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Nilai</p>
                                    <p className="text-4xl font-bold text-primary">{todayEvaluation.data?.total_score ?? '-'}</p>
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

                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-4 flex flex-col h-full ease-in-out duration-300 min-h-0">
                    {(rightPanelMode === 'ACTIVITY' || viewMode === 'EVALUATION') ? (
                        viewMode === 'EVALUATION' ? (
                            <div className="h-full flex flex-col min-h-0">
                                <div className="mb-4 shrink-0">
                                    <h2 className="text-lg font-bold text-gray-800 mb-2">
                                        {selectedDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                                    </h2>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 pb-4 min-h-0">
                                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 mb-4">
                                        <h3 className="text-sm font-semibold text-gray-600 mb-4">{activityMonitorTitle}</h3>

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
                                            <p className="text-xs text-gray-400 italic">Belum ada data aktivitas bulan ini.</p>
                                        )}
                                    </div>

                                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 mb-4">
                                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center mb-4">
                                            PERIODE ABSEN {getAttendancePeriodLabel()}
                                        </h3>
                                        <div className="overflow-x-auto">
                                            <table className="mx-auto border-collapse text-center">
                                                <thead>
                                                    <tr>
                                                        {attendanceColumns.map((column) => (
                                                            <th
                                                                key={column.label}
                                                                className="bg-indigo-500 text-white border border-gray-600 px-2 py-2 text-[8px] font-bold leading-tight uppercase"
                                                            >
                                                                {column.label}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr>
                                                        {attendanceColumns.map((column) => (
                                                            <td
                                                                key={column.label}
                                                                className="bg-white text-gray-900 border border-gray-600 px-2 py-2 text-sm font-bold"
                                                            >
                                                                {column.value}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 mb-4 min-h-[100px] flex flex-col">
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                            HASIL PENILAIAN SIKAP KEPRIBADIAN ({selectedDate.toLocaleDateString('id-ID', { month: 'long' })})
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                                                TOTAL NILAI:
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
                                                        * Belum diisi
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">AKUMULASI NILAI TAHUNAN</h3>
                                        <p className="text-sm font-medium text-gray-400 mb-1">Total Nilai :</p>
                                        <div className="text-6xl font-light text-black tracking-tighter">
                                            {evalStats?.yearly_score ?? '-'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full min-h-0">
                                <div className="mb-4 shrink-0">
                                    <h2 className="font-bold text-gray-800 text-lg">Aktivitas</h2>
                                    <p className="text-sm text-gray-400">
                                        {selectedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
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
                                            Belum ada log aktivitas pada tanggal ini.
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
                                readOnly={previewTask.status === 'approved' || new Date(previewTask.due_at) < new Date() || isTaskNotStarted(previewTask) || !isToday(selectedDate)}
                            />
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
