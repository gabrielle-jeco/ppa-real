import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
    BarChart2,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock3,
    ShieldCheck,
    UserRoundCheck,
    X,
    XCircle,
} from 'lucide-react';
import { getAttendanceColor as getAttendanceStatusColor, getAttendanceDay } from '../utils/attendanceCalendar';

type BackupOption = {
    id: string;
    name: string;
    locations?: string[];
};

type BackupRequest = {
    id: number;
    requester: BackupOption;
    backup_supervisor: BackupOption;
    start_date: string;
    end_date: string;
    reason?: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    is_active: boolean;
    crew_count: number;
};

type BackupPayload = {
    outgoing: BackupRequest[];
    incoming: BackupRequest[];
    pagination: {
        outgoing: BackupPagination;
        incoming: BackupPagination;
    };
    pending_incoming_count: number;
};

type BackupPagination = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

const emptyPagination: BackupPagination = {
    current_page: 1,
    last_page: 1,
    per_page: 5,
    total: 0,
};

const emptyBackupPayload: BackupPayload = {
    outgoing: [],
    incoming: [],
    pagination: {
        outgoing: emptyPagination,
        incoming: emptyPagination,
    },
    pending_incoming_count: 0,
};

const toDateInput = (date: Date) => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
});

const statusLabel: Record<BackupRequest['status'], string> = {
    pending: 'Menunggu',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    expired: 'Selesai',
};

const statusClass: Record<BackupRequest['status'], string> = {
    pending: 'bg-amber-50 text-amber-700',
    approved: 'bg-green-50 text-green-700',
    rejected: 'bg-red-50 text-red-600',
    expired: 'bg-gray-100 text-gray-500',
};

async function readApiError(response: Response) {
    try {
        const payload = await response.json();
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().find(Boolean)
            : null;
        return String(validationMessage || payload?.message || 'Permintaan tidak dapat diproses.');
    } catch {
        return 'Permintaan tidak dapat diproses.';
    }
}

export default function SupervisorPerformance() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [backupOptions, setBackupOptions] = useState<BackupOption[]>([]);
    const [backupRequests, setBackupRequests] = useState<BackupPayload>(emptyBackupPayload);
    const [backupPages, setBackupPages] = useState({ outgoing: 1, incoming: 1 });
    const [backupTab, setBackupTab] = useState<'outgoing' | 'incoming'>('outgoing');
    const [backupLoading, setBackupLoading] = useState(true);
    const [backupBusyId, setBackupBusyId] = useState<number | null>(null);
    const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const today = new Date();
    const todayInput = toDateInput(today);
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const [backupForm, setBackupForm] = useState({
        backup_supervisor_id: '',
        start_date: todayInput,
        end_date: todayInput,
        reason: '',
    });

    const authHeaders = (withJson = false) => ({
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        Accept: 'application/json',
        ...(withJson ? { 'Content-Type': 'application/json' } : {}),
    });

    const fetchStats = async () => {
        setLoading(true);
        try {
            const month = selectedDate.getMonth() + 1;
            const year = selectedDate.getFullYear();
            const response = await fetch(`/api/supervisor/stats?month=${month}&year=${year}`, {
                headers: authHeaders(),
            });

            if (response.ok) {
                setStats(await response.json());
            }
        } catch (error) {
            console.error('Gagal mengambil statistik', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchBackupData = async (pages = backupPages) => {
        setBackupLoading(true);
        try {
            const [optionsResponse, requestsResponse] = await Promise.all([
                fetch('/api/supervisor/backup-options', { headers: authHeaders() }),
                fetch(`/api/supervisor/backups?outgoing_page=${pages.outgoing}&incoming_page=${pages.incoming}&per_page=5`, { headers: authHeaders() }),
            ]);

            if (!optionsResponse.ok) throw new Error(await readApiError(optionsResponse));
            if (!requestsResponse.ok) throw new Error(await readApiError(requestsResponse));

            const requestsPayload: BackupPayload = await requestsResponse.json();
            setBackupOptions(await optionsResponse.json());
            setBackupRequests(requestsPayload);
            setBackupPages({
                outgoing: requestsPayload.pagination.outgoing.current_page,
                incoming: requestsPayload.pagination.incoming.current_page,
            });
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Data backup supervisor gagal dimuat.',
            });
        } finally {
            setBackupLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, [selectedDate]);

    useEffect(() => {
        fetchBackupData({ outgoing: 1, incoming: 1 });
    }, []);

    useEffect(() => {
        if (!feedback) return;
        const timeout = window.setTimeout(() => setFeedback(null), 5000);
        return () => window.clearTimeout(timeout);
    }, [feedback]);

    const openBackupModal = () => {
        setBackupForm({
            backup_supervisor_id: '',
            start_date: todayInput,
            end_date: todayInput,
            reason: '',
        });
        setFeedback(null);
        setIsBackupModalOpen(true);
    };

    const submitBackupRequest = async (event: FormEvent) => {
        event.preventDefault();
        setBackupBusyId(0);
        setFeedback(null);

        try {
            const response = await fetch('/api/supervisor/backups', {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify(backupForm),
            });

            if (!response.ok) throw new Error(await readApiError(response));

            setIsBackupModalOpen(false);
            setBackupTab('outgoing');
            setFeedback({ type: 'success', message: 'Pengajuan backup berhasil dikirim.' });
            const nextPages = { ...backupPages, outgoing: 1 };
            setBackupPages(nextPages);
            await fetchBackupData(nextPages);
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Pengajuan backup gagal dikirim.',
            });
        } finally {
            setBackupBusyId(null);
        }
    };

    const respondToBackup = async (requestId: number, decision: 'approved' | 'rejected') => {
        setBackupBusyId(requestId);
        setFeedback(null);

        try {
            const response = await fetch(`/api/supervisor/backups/${requestId}/respond`, {
                method: 'PATCH',
                headers: authHeaders(true),
                body: JSON.stringify({ decision }),
            });

            if (!response.ok) throw new Error(await readApiError(response));

            setFeedback({
                type: 'success',
                message: decision === 'approved'
                    ? 'Permintaan backup disetujui.'
                    : 'Permintaan backup ditolak.',
            });
            await fetchBackupData(backupPages);
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Keputusan backup gagal disimpan.',
            });
        } finally {
            setBackupBusyId(null);
        }
    };

    const changeBackupPage = async (tab: 'outgoing' | 'incoming', page: number) => {
        const pagination = backupRequests.pagination[tab];
        if (page < 1 || page > pagination.last_page || page === pagination.current_page) return;

        const nextPages = { ...backupPages, [tab]: page };
        setBackupPages(nextPages);
        await fetchBackupData(nextPages);
    };

    const getAvailableMonths = (year: number) => {
        if (year === currentYear) {
            return Array.from({ length: currentMonth + 1 }, (_, index) => index);
        }
        return Array.from({ length: 12 }, (_, index) => index);
    };

    const isFutureDate = (date: Date) => {
        const candidate = new Date(date);
        const current = new Date(today);
        candidate.setHours(0, 0, 0, 0);
        current.setHours(0, 0, 0, 0);
        return candidate > current;
    };

    const getAttendanceColor = (day: number) => {
        const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
        const attendanceDay = getAttendanceDay(stats?.attendance_calendar, date);
        return getAttendanceStatusColor(attendanceDay?.status_code, isFutureDate(date));
    };

    const renderCalendar = () => {
        const days = [];
        const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
        const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay();

        for (let index = 0; index < firstDay; index++) {
            days.push(<div key={`empty-${index}`} className="h-8" />);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = day === today.getDate()
                && selectedDate.getMonth() === today.getMonth()
                && selectedDate.getFullYear() === today.getFullYear();

            days.push(
                <div
                    key={day}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${getAttendanceColor(day)} ${isToday ? 'z-10 ring-2 ring-primary ring-offset-2' : ''}`}
                >
                    {day}
                </div>
            );
        }

        return days;
    };

    const activeRequests = backupRequests[backupTab];
    const activePagination = backupRequests.pagination[backupTab];
    const pendingIncoming = backupRequests.pending_incoming_count;
    const taskForScPercentage = stats?.task_for_sc?.total
        ? (stats.task_for_sc.completed / stats.task_for_sc.total) * 100
        : 0;
    const managerPercentage = stats?.task_from_manager?.total
        ? (stats.task_from_manager.completed / stats.task_from_manager.total) * 100
        : 0;

    if (loading) {
        return <div className="p-10 text-gray-400">Memuat...</div>;
    }

    return (
        <div className="flex h-full flex-1 flex-col overflow-y-auto bg-gray-50 p-8">
            <div className="mb-8 flex flex-shrink-0 items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Dasbor Saya</h1>
                    <p className="mt-1 text-sm text-gray-400">Monitoring performa dan KPI</p>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-white shadow-sm">
                    <BarChart2 size={16} />
                    <span className="text-sm font-bold">Performa</span>
                </div>
            </div>

            {feedback && (
                <div className={`mb-5 flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 text-sm font-semibold ${feedback.type === 'success' ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-600'}`}>
                    <span>{feedback.message}</span>
                    <button type="button" onClick={() => setFeedback(null)} className="rounded-lg p-1 transition hover:bg-black/5" aria-label="Tutup pemberitahuan">
                        <X size={16} />
                    </button>
                </div>
            )}

            {stats && (
                <div className="animate-fade-in">
                    <div className="mb-6 flex justify-start gap-2">
                        <div className="group relative w-40">
                            <select
                                value={selectedDate.getMonth()}
                                onChange={(event) => {
                                    const newDate = new Date(selectedDate);
                                    newDate.setMonth(parseInt(event.target.value));
                                    setSelectedDate(newDate);
                                }}
                                className="w-full cursor-pointer appearance-none rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm outline-none transition-colors hover:border-purple-300"
                            >
                                {getAvailableMonths(selectedDate.getFullYear()).map((month) => (
                                    <option key={month} value={month}>
                                        {new Date(0, month).toLocaleString('id-ID', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                        <div className="group relative w-28">
                            <select
                                value={selectedDate.getFullYear()}
                                onChange={(event) => {
                                    const newDate = new Date(selectedDate);
                                    const year = parseInt(event.target.value);
                                    newDate.setFullYear(year);
                                    if (year === currentYear && newDate.getMonth() > currentMonth) {
                                        newDate.setMonth(currentMonth);
                                    }
                                    setSelectedDate(newDate);
                                }}
                                className="w-full cursor-pointer appearance-none rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm outline-none transition-colors hover:border-purple-300"
                            >
                                {Array.from({ length: currentYear - 2024 + 1 }, (_, index) => 2024 + index).map((year) => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                    </div>

                    <div className="mb-8 flex flex-col gap-6 lg:flex-row">
                        <div className="flex w-full flex-shrink-0 flex-col gap-6 lg:w-[400px]">
                            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                                <h3 className="mb-4 text-sm font-semibold text-gray-600">Riwayat Kehadiran</h3>
                                <div className="mb-2 grid grid-cols-7 border-b border-gray-100 pb-2 text-center">
                                    {['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'].map((day) => (
                                        <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 justify-items-center gap-y-3">
                                    {renderCalendar()}
                                </div>
                            </div>

                            <section className="flex h-[320px] flex-col rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Pengalihan Sementara</p>
                                        <h3 className="mt-1 text-base font-black text-gray-800">Backup Supervisor</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={openBackupModal}
                                        className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary-dark"
                                    >
                                        Ajukan
                                    </button>
                                </div>

                                <div className="mt-4 grid grid-cols-2 rounded-xl bg-gray-50 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setBackupTab('outgoing')}
                                        className={`rounded-lg px-2 py-2 text-xs font-bold transition ${backupTab === 'outgoing' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}
                                    >
                                        Pengajuan Saya
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBackupTab('incoming')}
                                        className={`relative rounded-lg px-2 py-2 text-xs font-bold transition ${backupTab === 'incoming' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}
                                    >
                                        Permintaan Masuk
                                        {pendingIncoming > 0 && (
                                            <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white">{pendingIncoming}</span>
                                        )}
                                    </button>
                                </div>

                                <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                                    {backupLoading && (
                                        <div className="rounded-2xl bg-gray-50 px-4 py-7 text-center text-xs text-gray-400">Memuat pengajuan...</div>
                                    )}

                                    {!backupLoading && activeRequests.length === 0 && (
                                        <div className="rounded-2xl bg-gray-50 px-4 py-7 text-center text-xs text-gray-400">
                                            Belum ada {backupTab === 'outgoing' ? 'pengajuan backup' : 'permintaan masuk'}.
                                        </div>
                                    )}

                                    {!backupLoading && activeRequests.map((request) => {
                                        const person = backupTab === 'outgoing' ? request.backup_supervisor : request.requester;

                                        return (
                                            <article key={request.id} className="rounded-2xl border border-gray-100 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-black text-gray-800">{person.name}</p>
                                                        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-gray-400">
                                                            <CalendarDays size={12} />
                                                            {formatDate(request.start_date)} - {formatDate(request.end_date)}
                                                        </p>
                                                    </div>
                                                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusClass[request.status]}`}>
                                                        {request.is_active ? 'Aktif' : statusLabel[request.status]}
                                                    </span>
                                                </div>

                                                {request.reason && (
                                                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-gray-500">{request.reason}</p>
                                                )}

                                                {request.status === 'approved' || request.status === 'expired' ? (
                                                    <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-gray-400">
                                                        <UserRoundCheck size={13} />
                                                        {request.crew_count} crew tercakup
                                                    </p>
                                                ) : null}

                                                {backupTab === 'incoming' && request.status === 'pending' && (
                                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={backupBusyId === request.id}
                                                            onClick={() => respondToBackup(request.id, 'rejected')}
                                                            className="flex items-center justify-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                                                        >
                                                            <XCircle size={14} />
                                                            Tolak
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={backupBusyId === request.id}
                                                            onClick={() => respondToBackup(request.id, 'approved')}
                                                            className="flex items-center justify-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
                                                        >
                                                            <Check size={14} />
                                                            Setujui
                                                        </button>
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>

                                <BackupPaginationControls
                                    key={backupTab}
                                    pagination={activePagination}
                                    loading={backupLoading}
                                    onPageChange={(page) => changeBackupPage(backupTab, page)}
                                />
                            </section>
                        </div>

                        <div className="flex flex-1 flex-col gap-6">
                            <div className="flex-shrink-0 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-2 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-gray-600">Rata-rata Poin Saya</h3>
                                    <span className="text-sm font-bold text-gray-800">{stats.my_avg_point}%</span>
                                </div>
                                <div className="h-4 w-full overflow-hidden rounded-full bg-purple-100">
                                    <div className="h-4 rounded-full bg-yellow-400 transition-all duration-500" style={{ width: `${stats.my_avg_point}%` }} />
                                </div>
                            </div>

                            <div className="grid h-full flex-1 grid-cols-1 gap-6 md:grid-cols-2">
                                <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                                    <h3 className="mb-4 text-sm font-semibold text-gray-600">{stats.task_for_sc.label || 'Pekerjaan untuk SC'}</h3>
                                    <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-purple-100">
                                        <div className="h-3 rounded-full bg-red-500 transition-all duration-500" style={{ width: `${taskForScPercentage}%` }} />
                                    </div>
                                    <p className="text-xs text-gray-400">{stats.task_for_sc.completed}% Selesai</p>
                                </div>

                                <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                                    <h3 className="mb-4 text-sm font-semibold text-gray-600">{stats.task_from_manager.label || 'Penilaian Manager'}</h3>
                                    <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-purple-100">
                                        <div className="h-3 rounded-full bg-red-500 transition-all duration-500" style={{ width: `${managerPercentage}%` }} />
                                    </div>
                                    <p className="text-xs text-gray-400">{stats.task_from_manager.completed}%</p>
                                </div>

                                <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                                    <h3 className="mb-4 text-sm font-semibold text-gray-600">Pekerjaan yang Diberikan (Bulanan)</h3>
                                    <div className="rounded-xl bg-gray-200 p-4 text-center">
                                        <span className="font-bold text-gray-700">{stats.monthly_task_given}</span>
                                    </div>
                                </div>

                                <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                                    <h3 className="mb-4 text-sm font-semibold text-gray-600">Rata-rata Nilai Service Crew</h3>
                                    <div className="rounded-xl bg-gray-200 p-4 text-center">
                                        <span className="font-bold text-gray-700">{stats.avg_service_crew_point}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isBackupModalOpen && createPortal(
                <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-gray-950/35 p-4 backdrop-blur-[2px]">
                    <button
                        type="button"
                        aria-label="Tutup modal"
                        onClick={() => setIsBackupModalOpen(false)}
                        className="absolute inset-0 cursor-default"
                    />
                    <form
                        onSubmit={submitBackupRequest}
                        className="relative my-auto w-full max-w-lg rounded-3xl border border-gray-100 bg-white p-7 shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex gap-3">
                                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-primary">
                                    <ShieldCheck size={22} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Pengalihan Sementara</p>
                                    <h2 className="mt-1 text-xl font-black text-gray-900">Ajukan Backup Supervisor</h2>
                                    <p className="mt-1 text-xs leading-5 text-gray-500">Supervisor tujuan harus menyetujui pengajuan sebelum akses backup aktif.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsBackupModalOpen(false)}
                                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition hover:bg-gray-200"
                                aria-label="Tutup"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {feedback?.type === 'error' && (
                            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold leading-5 text-red-600">
                                {feedback.message}
                            </div>
                        )}

                        <div className="mt-6 space-y-4">
                            <div className="block">
                                <span className="mb-2 block text-xs font-bold text-gray-600">Supervisor Backup</span>
                                <SearchableSupervisorSelect
                                    value={backupForm.backup_supervisor_id}
                                    options={backupOptions}
                                    onChange={(value) => setBackupForm((current) => ({ ...current, backup_supervisor_id: value }))}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <label className="block">
                                    <span className="mb-2 block text-xs font-bold text-gray-600">Tanggal Mulai</span>
                                    <input
                                        type="date"
                                        value={backupForm.start_date}
                                        min={todayInput}
                                        onChange={(event) => setBackupForm((current) => ({
                                            ...current,
                                            start_date: event.target.value,
                                            end_date: current.end_date < event.target.value ? event.target.value : current.end_date,
                                        }))}
                                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-purple-100"
                                        required
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-2 block text-xs font-bold text-gray-600">Tanggal Berakhir</span>
                                    <input
                                        type="date"
                                        value={backupForm.end_date}
                                        min={backupForm.start_date || todayInput}
                                        onChange={(event) => setBackupForm((current) => ({ ...current, end_date: event.target.value }))}
                                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-purple-100"
                                        required
                                    />
                                </label>
                            </div>

                            <label className="block">
                                <span className="mb-2 block text-xs font-bold text-gray-600">Alasan (Opsional)</span>
                                <textarea
                                    value={backupForm.reason}
                                    onChange={(event) => setBackupForm((current) => ({ ...current, reason: event.target.value }))}
                                    rows={3}
                                    maxLength={1000}
                                    placeholder="Contoh: cuti, sakit, izin, atau off."
                                    className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-purple-100"
                                />
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={backupBusyId === 0 || backupOptions.length === 0 || !backupForm.backup_supervisor_id}
                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-black text-white shadow-lg shadow-purple-100 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {backupBusyId === 0 ? <Clock3 size={17} className="animate-spin" /> : <Check size={17} />}
                            {backupBusyId === 0 ? 'Mengirim...' : 'Kirim Pengajuan'}
                        </button>
                    </form>
                </div>,
                document.body,
            )}
        </div>
    );
}

function BackupPaginationControls({
    pagination,
    loading,
    onPageChange,
}: {
    pagination: BackupPagination;
    loading: boolean;
    onPageChange: (page: number) => void | Promise<void>;
}) {
    const [jumpPage, setJumpPage] = useState('');
    const totalPages = Math.max(pagination.last_page, 1);
    const currentPage = Math.min(Math.max(pagination.current_page, 1), totalPages);

    const pageItems: Array<number | string> = totalPages <= 4
        ? Array.from({ length: totalPages }, (_, index) => index + 1)
        : [
            1,
            ...(currentPage > 2 ? ['left-ellipsis'] : []),
            ...(currentPage > 1 && currentPage < totalPages ? [currentPage] : []),
            ...(currentPage < totalPages - 1 ? ['right-ellipsis'] : []),
            totalPages,
        ];

    const goToPage = (page: number) => {
        const target = Math.min(Math.max(page, 1), totalPages);
        if (!loading && target !== currentPage) onPageChange(target);
    };

    const submitJump = (event: FormEvent) => {
        event.preventDefault();
        const target = Number(jumpPage);
        if (Number.isInteger(target)) goToPage(target);
        setJumpPage('');
    };

    return (
        <div className="mt-3 flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto pb-1">
                <button
                    type="button"
                    aria-label="Halaman sebelumnya"
                    disabled={loading || currentPage <= 1}
                    onClick={() => goToPage(currentPage - 1)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-primary transition hover:border-primary hover:bg-purple-50 disabled:cursor-not-allowed disabled:text-gray-300"
                >
                    <ChevronLeft size={14} />
                </button>
                {pageItems.map((item) => typeof item === 'number' ? (
                    <button
                        key={item}
                        type="button"
                        disabled={loading}
                        onClick={() => goToPage(item)}
                        className={`h-8 min-w-8 flex-shrink-0 rounded-lg px-2 text-xs font-black transition ${item === currentPage
                            ? 'bg-primary text-white shadow-sm'
                            : 'border border-gray-200 text-gray-500 hover:border-primary hover:text-primary'
                        }`}
                    >
                        {item}
                    </button>
                ) : (
                    <span key={item} className="flex-shrink-0 px-1 text-xs font-bold text-gray-300">...</span>
                ))}
                <button
                    type="button"
                    aria-label="Halaman berikutnya"
                    disabled={loading || currentPage >= totalPages}
                    onClick={() => goToPage(currentPage + 1)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-primary transition hover:border-primary hover:bg-purple-50 disabled:cursor-not-allowed disabled:text-gray-300"
                >
                    <ChevronRight size={14} />
                </button>
            </div>

            <form onSubmit={submitJump} className="flex flex-shrink-0 items-center gap-1.5">
                <span className="text-[11px] font-bold text-gray-400">{currentPage}/{totalPages}</span>
                <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={jumpPage}
                    onChange={(event) => setJumpPage(event.target.value)}
                    placeholder="Ke"
                    aria-label="Nomor halaman tujuan"
                    className="h-8 w-14 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600 outline-none focus:border-primary"
                />
                <button
                    disabled={loading || !jumpPage}
                    className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-600 transition hover:border-primary hover:text-primary disabled:opacity-40"
                >
                    Buka
                </button>
            </form>
        </div>
    );
}

function SearchableSupervisorSelect({
    value,
    options,
    onChange,
}: {
    value: string;
    options: BackupOption[];
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const selected = options.find((option) => option.id === value);
    const optionLabel = (option: BackupOption) => (
        `${option.name}${option.locations?.length ? ` (${option.locations.join(', ')})` : ''}`
    );
    const filteredOptions = options.filter((option) => (
        optionLabel(option).toLocaleLowerCase('id-ID').includes(search.trim().toLocaleLowerCase('id-ID'))
    ));

    useEffect(() => {
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
        return () => document.removeEventListener('mousedown', closeOnOutsideClick);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => {
                    setOpen((current) => !current);
                    setSearch('');
                }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left text-sm text-gray-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-purple-100"
            >
                <span className={`truncate ${selected ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
                    {selected ? optionLabel(selected) : 'Pilih supervisor'}
                </span>
                <ChevronDown size={16} className={`flex-shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                    <div className="border-b border-gray-100 p-2">
                        <input
                            type="text"
                            autoFocus
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Cari nama atau lokasi..."
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                    </div>
                    <div className="max-h-52 overflow-y-auto overscroll-contain p-1">
                        {filteredOptions.length === 0 ? (
                            <p className="px-3 py-5 text-center text-xs text-gray-400">Supervisor tidak ditemukan.</p>
                        ) : filteredOptions.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                    onChange(option.id);
                                    setOpen(false);
                                }}
                                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${option.id === value
                                    ? 'bg-purple-50 font-bold text-primary'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {optionLabel(option)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
