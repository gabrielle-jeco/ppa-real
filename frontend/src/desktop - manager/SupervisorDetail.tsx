import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, Edit3, Trash2 } from 'lucide-react';
import AddTaskModal from '../general/AddTaskModal';
import TaskPreview from '../general/TaskPreview';
import TaskStartStatus from '../general/TaskStartStatus';
import ManagerReviewForm from './ManagerReviewForm';
import { getAttendanceColor as getAttendanceStatusColor, getAttendanceDay } from '../utils/attendanceCalendar';
import { clampToTaskWindow, getAvailableTaskMonths, getAvailableTaskYears, isAfterTaskWindow } from '../utils/taskDateWindow';
import { formatDisplayNumber } from '../general/numberFormat';
import { formatTaskTitleWithArea } from '../utils/taskDisplay';

interface SupervisorDetailProps {
    supervisor: any;
    selectedCrewId: string | null;
    onSelectCrew: (id: string | null) => void;
    onCrewRowsChange: (crews: any[]) => void;
    onTaskChange?: () => void;
}

export default function SupervisorDetail({ supervisor, selectedCrewId, onSelectCrew, onCrewRowsChange, onTaskChange }: SupervisorDetailProps) {
    const [viewMode, setViewMode] = useState<'TASKS' | 'REVIEW'>('TASKS');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [stats, setStats] = useState<any>(null);
    const [crewRows, setCrewRows] = useState<any[]>([]);
    const [reviewStatus, setReviewStatus] = useState<any>(null);
    const [previewTask, setPreviewTask] = useState<any>(null);
    const [editingTask, setEditingTask] = useState<any>(null);
    const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
    const statsRequestRef = useRef(0);
    const crewTasksRequestRef = useRef(0);
    const reviewStatusRequestRef = useRef(0);

    async function fetchStats(date = selectedDate, supervisorId = supervisor.id) {
        const requestId = ++statsRequestRef.current;
        try {
            const token = localStorage.getItem('auth_token');
            const month = date.getMonth() + 1;
            const year = date.getFullYear();
            const day = date.getDate();
            const res = await fetch(`/api/manager/supervisors/${supervisorId}/stats?month=${month}&year=${year}&day=${day}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            });

            if (res.ok) {
                const payload = await res.json();
                if (requestId !== statsRequestRef.current) return;
                setStats(payload);
            }
        } catch (error) {
            if (requestId !== statsRequestRef.current) return;
            console.error('Fetch supervisor stats failed', error);
        }
    }

    async function fetchCrewTasks(date = selectedDate, supervisorId = supervisor.id) {
        const requestId = ++crewTasksRequestRef.current;
        try {
            const token = localStorage.getItem('auth_token');
            const requestDate = date.toLocaleDateString('en-CA');
            const res = await fetch(`/api/manager/supervisors/${supervisorId}/crews?date=${requestDate}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            });

            if (res.ok) {
                const data = await res.json();
                if (requestId !== crewTasksRequestRef.current) return;
                const crews = data.crews || [];
                setCrewRows(crews);
                onCrewRowsChange(crews);

                if (crews.length > 0 && !crews.some((crew: any) => crew.id === selectedCrewId)) {
                    onSelectCrew(crews[0].id);
                } else if (crews.length === 0) {
                    onSelectCrew(null);
                }
            }
        } catch (error) {
            if (requestId !== crewTasksRequestRef.current) return;
            console.error('Fetch supervisor crew tasks failed', error);
        }
    }

    async function fetchReviewStatus(date = selectedDate, supervisorId = supervisor.id) {
        const requestId = ++reviewStatusRequestRef.current;
        try {
            const token = localStorage.getItem('auth_token');
            const requestDate = date.toLocaleDateString('en-CA');
            const res = await fetch(`/api/evaluations/check/${supervisorId}?date=${requestDate}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            });

            if (res.ok) {
                const payload = await res.json();
                if (requestId !== reviewStatusRequestRef.current) return;
                setReviewStatus(payload);
            }
        } catch (error) {
            if (requestId !== reviewStatusRequestRef.current) return;
            console.error('Fetch manager review status failed', error);
        }
    }

    useEffect(() => {
        if (!supervisor?.id) return;

        setViewMode('TASKS');
        setPreviewTask(null);
        statsRequestRef.current += 1;
        crewTasksRequestRef.current += 1;
        reviewStatusRequestRef.current += 1;
        setStats(null);
        setCrewRows([]);
        setReviewStatus(null);
    }, [supervisor?.id]);

    useEffect(() => {
        if (!supervisor?.id) return;

        fetchStats(selectedDate, supervisor.id);
        fetchCrewTasks(selectedDate, supervisor.id);
        fetchReviewStatus(selectedDate, supervisor.id);
        setPreviewTask(null);
    }, [selectedDate, supervisor?.id]);

    useEffect(() => {
        const timer = window.setInterval(() => setCurrentTimestamp(Date.now()), 30000);
        return () => window.clearInterval(timer);
    }, []);

    const getCalendarDays = () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: Array<Date | null> = [];

        for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
        for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));

        return days;
    };

    const isFutureDate = (date: Date) => {
        const d = new Date(date);
        const today = new Date();
        d.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return d > today;
    };

    const isUnavailableTaskDate = (date: Date) => isAfterTaskWindow(date);

    const getAttendanceColor = (day: Date) => {
        const attendanceDay = getAttendanceDay(stats?.attendance_calendar, day);
        return getAttendanceStatusColor(attendanceDay?.status_code, isFutureDate(day));
    };

    const selectedCrew = crewRows.find((crew) => crew.id === selectedCrewId);
    const selectedTasks = selectedCrew?.tasks || [];
    const completedTasks = selectedTasks.filter((task: any) => ['approved', 'completed'].includes(task.status)).length;
    const totalTasks = selectedTasks.length;
    const taskProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    const refreshReview = () => {
        fetchReviewStatus(selectedDate, supervisor.id);
        fetchStats(selectedDate, supervisor.id);
        onTaskChange?.();
    };

    const updateTask = async (payload: any) => {
        if (!editingTask) return;
        try {
            const response = await fetch(`/api/tasks/${editingTask.task_id || editingTask.id}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || data?.errors?.due_at?.[0] || 'Tugas tidak dapat diperbarui.');
            setEditingTask(null);
            await fetchCrewTasks(selectedDate, supervisor.id);
            onTaskChange?.();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Tugas tidak dapat diperbarui.');
        }
    };

    const deleteTask = async (task: any) => {
        const confirmation = task.assignment_batch_id
            ? 'Tugas ini bagian dari penugasan massal. Hapus seluruh penugasan massal ini?'
            : 'Hapus tugas ini?';
        if (!window.confirm(confirmation)) return;
        try {
            const response = await fetch(`/api/tasks/${task.task_id || task.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}`, Accept: 'application/json' },
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.message || 'Tugas tidak dapat dihapus.');
            setPreviewTask(null);
            await fetchCrewTasks(selectedDate, supervisor.id);
            onTaskChange?.();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Tugas tidak dapat dihapus.');
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 p-6 overflow-hidden relative">
            <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
                <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-2 lg:col-span-4 lg:gap-6 xl:col-span-4 2xl:col-span-3">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-primary mb-1">{supervisor.name}</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            Role as <span className="underline decoration-primary">Supervisor</span> at <br />
                            <span className="font-semibold">{supervisor.location}</span>
                        </p>
                        <button
                            onClick={() => setViewMode('REVIEW')}
                            className={`text-xs font-bold py-2 px-6 rounded-full transition w-full shadow-md ${viewMode === 'REVIEW'
                                ? 'bg-purple-100 text-primary border-2 border-primary'
                                : 'bg-primary text-white border-2 border-transparent hover:bg-purple-700'
                                }`}
                        >
                            Review
                        </button>
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">Crew Monitoring</h3>
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

                        <div className="mb-3">
                            <h4 className="mb-3 text-sm font-bold text-gray-800">Crew Terpilih</h4>
                            {!selectedCrew ? (
                                <div className="rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-400">Pilih crew dari kolom kiri.</div>
                            ) : (
                                <div className="rounded-xl border border-primary/30 bg-purple-50/60 p-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-bold text-gray-800">{selectedCrew.name}</p>
                                            <p className="text-[10px] uppercase text-gray-400">{selectedCrew.id} - {selectedCrew.role}</p>
                                        </div>
                                        <span className="text-[10px] font-bold text-primary">{selectedCrew.tasks_approved}/{selectedCrew.tasks_total}</span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-gray-500">
                                        <span>Pending {selectedCrew.tasks_pending}</span>
                                        <span>Overdue {selectedCrew.tasks_overdue}</span>
                                        <span>{formatDisplayNumber(selectedCrew.activity_percentage, '0')}%</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2 mb-1">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-primary h-1.5 rounded-full transition-all duration-500" style={{ width: `${taskProgress}%` }}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400">Selected Crew Task Completed: {completedTasks}/{totalTasks}</p>

                        <div className="bg-white rounded-2xl p-6 mt-6 border border-gray-100 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full -z-0 opacity-50"></div>

                            <div className="flex justify-between items-center mb-6 text-sm font-semibold text-gray-700 relative z-10 px-2">
                                <div className="flex items-center gap-2 w-full">
                                    <div className="relative group flex-1">
                                        <select
                                            value={selectedDate.getMonth()}
                                            onChange={(event) => {
                                                const newDate = new Date(selectedDate);
                                                newDate.setMonth(parseInt(event.target.value));
                                                setSelectedDate(clampToTaskWindow(newDate));
                                            }}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl px-3 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {Array.from({ length: 12 }, (_, i) => i)
                                                .filter((month) => getAvailableTaskMonths(selectedDate.getFullYear()).includes(month))
                                                .map((month) => (
                                                    <option key={month} value={month}>
                                                        {new Date(0, month).toLocaleString('en-US', { month: 'long' })}
                                                    </option>
                                                ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                                    </div>

                                    <div className="relative group w-24">
                                        <select
                                            value={selectedDate.getFullYear()}
                                            onChange={(event) => {
                                                const newDate = new Date(selectedDate);
                                                const year = parseInt(event.target.value);
                                                newDate.setFullYear(year);
                                                setSelectedDate(clampToTaskWindow(newDate));
                                            }}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {getAvailableTaskYears().map((year) => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 font-medium uppercase tracking-wider gap-y-4 mb-2 relative z-10">
                                <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                            </div>
                            <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-700 gap-y-3 relative z-10">
                                {getCalendarDays().map((day, idx) => {
                                    if (!day) return <div key={idx}></div>;

                                    const isSelected = day.getDate() === selectedDate.getDate()
                                        && day.getMonth() === selectedDate.getMonth()
                                        && day.getFullYear() === selectedDate.getFullYear();

                                    if (viewMode === 'REVIEW') {
                                        const now = new Date();
                                        const isToday = day.getDate() === now.getDate()
                                            && day.getMonth() === now.getMonth()
                                            && day.getFullYear() === now.getFullYear();

                                        return (
                                            <div key={idx} className="flex justify-center">
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium ${getAttendanceColor(day)} ${isToday ? 'ring-2 ring-purple-500 ring-offset-2 z-10 font-bold' : ''}`}>
                                                    {day.getDate()}
                                                </div>
                                            </div>
                                        );
                                    }

                                    const isFuture = isUnavailableTaskDate(day);

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

                <div className="flex h-full min-h-0 flex-col overflow-hidden lg:col-span-4 xl:col-span-4 2xl:col-span-5">
                    {viewMode === 'TASKS' ? (
                        <>
                            <div className="mb-4">
                                <h2 className="font-bold text-gray-800 text-lg">Monitoring Pekerjaan Crew</h2>
                                <p className="text-sm text-gray-400">
                                    {selectedCrew ? `${selectedCrew.name} - ${selectedDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}` : 'Pilih crew untuk melihat pekerjaan yang diberikan'}
                                </p>
                            </div>

                            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                                {!selectedCrew && (
                                    <div className="text-center text-gray-400 py-10 bg-white rounded-2xl border border-gray-100">Pilih crew untuk melihat pekerjaan yang diberikan.</div>
                                )}
                                {selectedCrew && selectedTasks.length === 0 && (
                                    <div className="text-center text-gray-400 py-10 bg-white rounded-2xl border border-gray-100">Tidak ada pekerjaan untuk crew dan tanggal ini.</div>
                                )}
                                {selectedTasks.map((task: any) => {
                                    const beforeCount = (task.evidences || []).filter((evidence: any) => evidence.type === 'before').length;
                                    const afterCount = (task.evidences || []).filter((evidence: any) => evidence.type === 'after').length;
                                    const rejectedCount = (task.evidences || []).filter((evidence: any) => evidence.type === 'after' && evidence.review_status === 'rejected').length;
                                    const isApproved = ['approved', 'completed'].includes(task.status);
                                    const isRejected = task.status === 'rejected';
                                    const isPastDue = new Date(task.due_at).getTime() < currentTimestamp;
                                    const isOverdue = task.status === 'pending' && isPastDue;
                                    const canEdit = !isApproved && !isPastDue && (task.evidences || []).length === 0;
                                    const canDelete = !isApproved && (task.review_summary?.can_delete ?? !isPastDue);
                                    const statusColor = isApproved
                                        ? 'text-green-600 bg-green-50'
                                        : isOverdue || isRejected
                                            ? 'bg-red-50 text-red-600'
                                            : 'text-gray-500 bg-gray-100';
                                    const statusLabels: Record<string, string> = {
                                        approved: 'Disetujui',
                                        completed: 'Selesai',
                                        pending: 'Menunggu',
                                        submitted: 'Dikirim',
                                        rejected: 'Ditolak',
                                    };

                                    return (
                                        <div key={task.task_id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition">
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-0.5 flex h-9 w-20 shrink-0 flex-col items-center justify-center rounded-lg px-2 text-center text-[10px] font-bold uppercase leading-tight ${statusColor}`}>
                                                    {isOverdue ? <><span>Tenggat</span><span>Terlewat</span></> : statusLabels[task.status] || task.status}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-semibold text-gray-700">{formatTaskTitleWithArea(task)}</p>
                                                    <TaskStartStatus
                                                        task={task}
                                                        scheduleClassName="text-[10px] text-gray-400 mt-1"
                                                        statusClassName="text-[10px] text-amber-500 font-semibold mt-0.5"
                                                    />
                                                    <p className="text-[10px] text-gray-400 mt-1">Tenggat: {new Date(task.due_at).toLocaleString('id-ID')}</p>
                                                    {task.work_station?.name && <p className="text-[10px] text-gray-500 mt-0.5">Kategori: {task.work_station.name}</p>}
                                                    {task.note && <p className="text-[10px] text-gray-500 leading-snug whitespace-pre-line break-words mt-0.5">{task.note}</p>}
                                                    <p className="mt-2 text-[10px] text-gray-400">Bukti: sebelum {beforeCount}, sesudah {afterCount} - Revisi {rejectedCount}</p>
                                                    {task.review_summary && <p className="mt-1 text-[10px] font-semibold text-gray-500">Percobaan {task.review_summary.current_attempt}/{task.review_summary.max_attempts} - Nilai {formatDisplayNumber(task.review_summary.potential_score, '0')}%</p>}
                                                </div>
                                                <div className="flex flex-col items-center gap-2">
                                                    <button onClick={() => setPreviewTask(task)} className="flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-purple-700"><Camera size={12} /> Bukti</button>
                                                    {(canEdit || canDelete) && (
                                                        <div className="flex w-full justify-center gap-1">
                                                            {canEdit && <button type="button" onClick={() => setEditingTask(task)} className="rounded-lg p-1.5 text-gray-400 hover:bg-purple-50 hover:text-primary" title="Edit tugas"><Edit3 size={14} /></button>}
                                                            {canDelete && <button type="button" onClick={() => deleteTask(task)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Hapus tugas"><Trash2 size={14} /></button>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <ManagerReviewForm
                            supervisor={supervisor}
                            targetDate={selectedDate}
                            evaluationStatus={reviewStatus}
                            onSuccess={refreshReview}
                        />
                    )}
                </div>

                <div className="flex h-full min-h-0 flex-col duration-300 ease-in-out lg:col-span-4 xl:col-span-4 2xl:col-span-4">
                    {previewTask && viewMode === 'TASKS' ? (
                        <div className="bg-white rounded-2xl p-5 h-full border border-gray-100 shadow-sm">
                            <TaskPreview
                                task={previewTask}
                                onClose={() => setPreviewTask(null)}
                                readOnly
                            />
                        </div>
                    ) : viewMode === 'TASKS' ? (
                        <div className="h-full flex flex-col">
                            <div className="mb-4">
                                <h2 className="font-bold text-gray-800 text-lg">Activity</h2>
                                <p className="text-sm text-gray-400">
                                    {selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>

                            {stats ? (
                                <div className="space-y-6 overflow-y-auto pr-2">
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
                                                <span className="font-bold text-gray-700 relative z-10">{formatDisplayNumber(stats.avg_sc_point_today, '0')}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <hr className="border-gray-200" />

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
                                                <span className="font-bold text-gray-700 relative z-10">{formatDisplayNumber(stats.avg_service_crew_point, '0')}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center p-6 text-gray-400 bg-white rounded-2xl">Loading Stats...</div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            <div className="mb-4">
                                <h2 className="text-lg font-bold text-gray-800 mb-2">
                                    {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </h2>
                            </div>

                            {stats ? (
                                <div className="space-y-6 overflow-y-auto pr-2 pb-4">
                                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="text-sm font-semibold text-gray-600">My AVG Point</h3>
                                            <span className="text-sm font-bold text-gray-800">{formatDisplayNumber(stats.my_avg_point, '0')}%</span>
                                        </div>
                                        <div className="w-full bg-purple-100 rounded-full h-4 overflow-hidden">
                                            <div className="bg-yellow-400 h-4 rounded-full transition-all duration-500" style={{ width: `${stats.my_avg_point}%` }}></div>
                                        </div>
                                    </div>

                                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                                        <h3 className="text-sm font-semibold text-gray-600 mb-4">{stats.task_for_sc.label}</h3>
                                        <div className="w-full bg-purple-100 rounded-full h-3 overflow-hidden mb-2">
                                            <div className="bg-red-500 h-3 rounded-full transition-all duration-500" style={{ width: `${(stats.task_for_sc.completed / Math.max(stats.task_for_sc.total, 1)) * 100}%` }}></div>
                                        </div>
                                        <p className="text-xs text-gray-400">{stats.task_for_sc.completed}% Completed</p>
                                    </div>

                                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                                        <h3 className="text-sm font-semibold text-gray-600 mb-4">{stats.task_from_manager.label}</h3>
                                        <div className="w-full bg-purple-100 rounded-full h-3 overflow-hidden mb-2">
                                            <div className="bg-red-500 h-3 rounded-full transition-all duration-500" style={{ width: `${(stats.task_from_manager.completed / Math.max(stats.task_from_manager.total, 1)) * 100}%` }}></div>
                                        </div>
                                        <p className="text-xs text-gray-400">{stats.task_from_manager.completed}%</p>
                                    </div>

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
                                                <span className="font-bold text-gray-700 text-sm">{formatDisplayNumber(stats.avg_service_crew_point, '0')}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center p-6 text-gray-400 bg-white rounded-2xl">Loading Stats...</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <AddTaskModal isOpen={!!editingTask} onClose={() => setEditingTask(null)} onSubmit={updateTask} initialTask={editingTask} requireCategory submitLabel="Simpan Perubahan" />
        </div>
    );
}
