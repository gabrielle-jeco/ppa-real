import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
    BarChart2, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3,
    FileChartColumn, ShieldCheck, UsersRound, X,
} from 'lucide-react';
import {
    defaultDailyFilter, defaultMonthlyFilter, fetchTeamScoreDetail,
    fetchTeamScoreSummary, formatPeriod, formatScore,
    type DailyDetailRow, type DailyFilter, type DailyMemberScore,
    type MonthlyDetailRow, type MonthlyFilter, type MonthlyMemberScore,
    type ReportMode, type TeamScoreDetail, type TeamScoreFilter,
    type TeamScoreMember, type TeamScoreSummary, validateTeamScoreFilter,
} from '../utils/teamScoreReport';
import ReportPeriodPicker from '../general/ReportPeriodPicker';

type BackupOption = { id: string; name: string; locations?: string[] };
type BackupRequest = {
    id: number; requester: BackupOption; backup_supervisor: BackupOption;
    start_date: string; end_date: string; reason?: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    is_active: boolean; crew_count: number;
};
type BackupPagination = { current_page: number; last_page: number; per_page: number; total: number };
type BackupPayload = {
    outgoing: BackupRequest[]; incoming: BackupRequest[];
    pagination: { outgoing: BackupPagination; incoming: BackupPagination };
    pending_incoming_count: number;
};

const emptyPagination: BackupPagination = { current_page: 1, last_page: 1, per_page: 5, total: 0 };
const emptyBackupPayload: BackupPayload = {
    outgoing: [], incoming: [],
    pagination: { outgoing: emptyPagination, incoming: emptyPagination },
    pending_incoming_count: 0,
};
const toDateInput = (date: Date) => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
});
const formatMonth = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString('id-ID', {
    month: 'short', year: 'numeric',
});
const statusLabel: Record<BackupRequest['status'], string> = {
    pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak', expired: 'Selesai',
};
const statusClass: Record<BackupRequest['status'], string> = {
    pending: 'bg-amber-50 text-amber-700', approved: 'bg-green-50 text-green-700',
    rejected: 'bg-red-50 text-red-600', expired: 'bg-gray-100 text-gray-500',
};

async function readApiError(response: Response) {
    try {
        const payload = await response.json();
        const validationMessage = payload?.errors ? Object.values(payload.errors).flat().find(Boolean) : null;
        return String(validationMessage || payload?.message || 'Permintaan tidak dapat diproses.');
    } catch {
        return 'Permintaan tidak dapat diproses.';
    }
}

export default function SupervisorPerformance() {
    const [mode, setMode] = useState<ReportMode>('daily');
    const [dailyFilter, setDailyFilter] = useState<DailyFilter>(defaultDailyFilter);
    const [monthlyFilter, setMonthlyFilter] = useState<MonthlyFilter>(defaultMonthlyFilter);
    const [activeFilter, setActiveFilter] = useState<TeamScoreFilter | null>(null);
    const [report, setReport] = useState<TeamScoreSummary | null>(null);
    const [detail, setDetail] = useState<TeamScoreDetail | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [backupOptions, setBackupOptions] = useState<BackupOption[]>([]);
    const [backupRequests, setBackupRequests] = useState<BackupPayload>(emptyBackupPayload);
    const [backupPages, setBackupPages] = useState({ outgoing: 1, incoming: 1 });
    const [backupTab, setBackupTab] = useState<'outgoing' | 'incoming'>('outgoing');
    const [backupLoading, setBackupLoading] = useState(true);
    const [backupBusyId, setBackupBusyId] = useState<number | null>(null);
    const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const todayInput = toDateInput(new Date());
    const [backupForm, setBackupForm] = useState({
        backup_supervisor_id: '', start_date: todayInput, end_date: todayInput, reason: '',
    });

    const authHeaders = (withJson = false) => ({
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        Accept: 'application/json',
        ...(withJson ? { 'Content-Type': 'application/json' } : {}),
    });

    const fetchBackupData = async (pages = backupPages) => {
        setBackupLoading(true);
        try {
            const [optionsResponse, requestsResponse] = await Promise.all([
                fetch('/api/supervisor/backup-options', { headers: authHeaders() }),
                fetch(`/api/supervisor/backups?outgoing_page=${pages.outgoing}&incoming_page=${pages.incoming}&per_page=5`, { headers: authHeaders() }),
            ]);
            if (!optionsResponse.ok) throw new Error(await readApiError(optionsResponse));
            if (!requestsResponse.ok) throw new Error(await readApiError(requestsResponse));
            const payload: BackupPayload = await requestsResponse.json();
            setBackupOptions(await optionsResponse.json());
            setBackupRequests(payload);
            setBackupPages({ outgoing: payload.pagination.outgoing.current_page, incoming: payload.pagination.incoming.current_page });
        } catch (error) {
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Data backup supervisor gagal dimuat.' });
        } finally {
            setBackupLoading(false);
        }
    };

    useEffect(() => { fetchBackupData({ outgoing: 1, incoming: 1 }); }, []);
    useEffect(() => {
        if (!feedback) return;
        const timeout = window.setTimeout(() => setFeedback(null), 5000);
        return () => window.clearTimeout(timeout);
    }, [feedback]);

    const loadDetail = async (filter: TeamScoreFilter, memberId: string) => {
        setSelectedMemberId(memberId);
        setDetailLoading(true);
        try {
            setDetail(await fetchTeamScoreDetail(filter, memberId));
        } catch (error) {
            setDetail(null);
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Detail nilai gagal dimuat.' });
        } finally {
            setDetailLoading(false);
        }
    };

    const submitReport = async (event: FormEvent) => {
        event.preventDefault();
        const filter = mode === 'daily' ? dailyFilter : monthlyFilter;
        const validationMessage = validateTeamScoreFilter(filter);
        if (validationMessage) {
            setFeedback({ type: 'error', message: validationMessage });
            return;
        }
        setReportLoading(true);
        setDetail(null);
        setSelectedMemberId(null);
        try {
            const payload = await fetchTeamScoreSummary(filter);
            setReport(payload);
            setActiveFilter(filter);
            if (payload.members[0]) await loadDetail(filter, payload.members[0].id);
        } catch (error) {
            setReport(null);
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Laporan gagal dimuat.' });
        } finally {
            setReportLoading(false);
        }
    };

    const openBackupModal = () => {
        setBackupForm({ backup_supervisor_id: '', start_date: todayInput, end_date: todayInput, reason: '' });
        setFeedback(null);
        setIsBackupModalOpen(true);
    };

    const submitBackupRequest = async (event: FormEvent) => {
        event.preventDefault();
        setBackupBusyId(0);
        setFeedback(null);
        try {
            const response = await fetch('/api/supervisor/backups', {
                method: 'POST', headers: authHeaders(true), body: JSON.stringify(backupForm),
            });
            if (!response.ok) throw new Error(await readApiError(response));
            setIsBackupModalOpen(false);
            setBackupTab('outgoing');
            setFeedback({ type: 'success', message: 'Pengajuan backup berhasil dikirim.' });
            await fetchBackupData({ ...backupPages, outgoing: 1 });
        } catch (error) {
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Pengajuan backup gagal dikirim.' });
        } finally {
            setBackupBusyId(null);
        }
    };

    const respondToBackup = async (requestId: number, decision: 'approved' | 'rejected') => {
        setBackupBusyId(requestId);
        try {
            const response = await fetch(`/api/supervisor/backups/${requestId}/respond`, {
                method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ decision }),
            });
            if (!response.ok) throw new Error(await readApiError(response));
            setFeedback({ type: 'success', message: decision === 'approved' ? 'Permintaan backup disetujui.' : 'Permintaan backup ditolak.' });
            await fetchBackupData(backupPages);
        } catch (error) {
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Keputusan backup gagal disimpan.' });
        } finally {
            setBackupBusyId(null);
        }
    };

    const activeRequests = backupRequests[backupTab];
    const activePagination = backupRequests.pagination[backupTab];

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 p-8">
            <header className="mb-6 flex flex-shrink-0 items-center justify-between">
                <div><h1 className="text-2xl font-bold text-gray-800">Dasbor Saya</h1><p className="mt-1 text-sm text-gray-400">Monitoring performa dan KPI</p></div>
                <div className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-white shadow-sm"><BarChart2 size={16} /><span className="text-sm font-bold">Performa</span></div>
            </header>

            {feedback && (
                <div className={`mb-4 flex flex-shrink-0 items-center justify-between gap-4 rounded-2xl border px-5 py-3 text-sm font-semibold ${feedback.type === 'success' ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-600'}`}>
                    <span>{feedback.message}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Tutup pemberitahuan"><X size={16} /></button>
                </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,40%)_minmax(0,1fr)] grid-rows-2 gap-5 xl:grid-cols-[clamp(360px,30vw,460px)_minmax(380px,1fr)_minmax(300px,0.9fr)] xl:grid-rows-1 2xl:grid-cols-[440px_minmax(460px,1fr)_minmax(320px,0.9fr)]">
                <aside className="row-span-2 flex min-h-0 flex-col gap-5 overflow-y-auto pr-1 xl:row-span-1">
                    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-primary"><UsersRound size={21} /></div><div><h2 className="font-black text-gray-800">Nilai Tim Saya</h2><p className="mt-1 text-xs leading-5 text-gray-400">Lihat nilai per karyawan.</p></div></div>
                        <div className="mt-5 grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setMode('daily')} className={`rounded-xl px-3 py-3 text-xs font-black transition ${mode === 'daily' ? 'bg-primary text-white shadow-md shadow-purple-100' : 'bg-gray-50 text-gray-500 hover:bg-purple-50 hover:text-primary'}`}>Nilai Harian</button>
                            <button type="button" onClick={() => setMode('monthly')} className={`rounded-xl px-3 py-3 text-xs font-black transition ${mode === 'monthly' ? 'bg-primary text-white shadow-md shadow-purple-100' : 'bg-gray-50 text-gray-500 hover:bg-purple-50 hover:text-primary'}`}>Nilai Bulanan</button>
                        </div>
                    </section>

                    <section className="flex min-h-[390px] flex-1 flex-col rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Pengalihan Sementara</p><h3 className="mt-1 text-base font-black text-gray-800">Backup Supervisor</h3></div><button type="button" onClick={openBackupModal} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white">Ajukan</button></div>
                        <div className="mt-4 grid grid-cols-2 rounded-xl bg-gray-50 p-1">
                            {(['outgoing', 'incoming'] as const).map((tab) => (
                                <button key={tab} type="button" onClick={() => setBackupTab(tab)} className={`relative rounded-lg px-2 py-2 text-xs font-bold ${backupTab === tab ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}>
                                    {tab === 'outgoing' ? 'Pengajuan Saya' : 'Permintaan Masuk'}
                                    {tab === 'incoming' && backupRequests.pending_incoming_count > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white">{backupRequests.pending_incoming_count}</span>}
                                </button>
                            ))}
                        </div>
                        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                            {backupLoading && <p className="rounded-2xl bg-gray-50 px-4 py-7 text-center text-xs text-gray-400">Memuat pengajuan...</p>}
                            {!backupLoading && activeRequests.length === 0 && <p className="rounded-2xl bg-gray-50 px-4 py-7 text-center text-xs text-gray-400">Belum ada data backup.</p>}
                            {!backupLoading && activeRequests.map((request) => {
                                const person = backupTab === 'outgoing' ? request.backup_supervisor : request.requester;
                                return (
                                    <article key={request.id} className="rounded-2xl border border-gray-100 p-4">
                                        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-black text-gray-800">{person.name}</p><p className="mt-1 text-[10px] font-semibold text-gray-400">{formatDate(request.start_date)} - {formatDate(request.end_date)}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${statusClass[request.status]}`}>{request.is_active ? 'Aktif' : statusLabel[request.status]}</span></div>
                                        {request.reason && <p className="mt-2 line-clamp-2 text-xs text-gray-500">{request.reason}</p>}
                                        {backupTab === 'incoming' && request.status === 'pending' && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={backupBusyId === request.id} onClick={() => respondToBackup(request.id, 'rejected')} className="rounded-xl bg-red-50 py-2 text-xs font-bold text-red-600">Tolak</button><button type="button" disabled={backupBusyId === request.id} onClick={() => respondToBackup(request.id, 'approved')} className="rounded-xl bg-green-600 py-2 text-xs font-bold text-white">Setujui</button></div>}
                                    </article>
                                );
                            })}
                        </div>
                        <BackupPaginationControls pagination={activePagination} loading={backupLoading} onPageChange={(page) => fetchBackupData({ ...backupPages, [backupTab]: page })} />
                    </section>
                </aside>

                <main className="flex min-h-0 flex-col rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-primary"><FileChartColumn size={20} /></div><div><h2 className="font-black text-gray-800">Nilai {mode === 'daily' ? 'Harian' : 'Bulanan'} Tim Saya</h2><p className="text-xs text-gray-400">{mode === 'daily' ? 'Maksimal 31 hari kalender.' : 'Maksimal 12 bulan selesai, termasuk lintas tahun.'}</p></div></div>
                    <ReportFilterForm mode={mode} dailyFilter={dailyFilter} monthlyFilter={monthlyFilter} setDailyFilter={setDailyFilter} setMonthlyFilter={setMonthlyFilter} loading={reportLoading} onSubmit={submitReport} />
                    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                        {reportLoading && <EmptyState text="Menghitung nilai tim..." />}
                        {!reportLoading && !report && <EmptyState text="Pilih periode, lalu tekan Tampilkan." />}
                        {!reportLoading && report?.members.length === 0 && <EmptyState text="Belum ada bawahan permanen aktif." />}
                        {!reportLoading && report && report.members.length > 0 && <div className="space-y-2">{report.members.map((member, index) => <MemberRow key={member.id} member={member} index={index} mode={report.mode} selected={member.id === selectedMemberId} onClick={() => activeFilter && loadDetail(activeFilter, member.id)} />)}</div>}
                    </div>
                </main>

                <section className="col-start-2 flex min-h-0 flex-col rounded-3xl border border-gray-100 bg-white p-5 shadow-sm xl:col-start-auto">
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Daftar Detail Nilai</p><h2 className="mt-1 font-black text-gray-800">{detail?.member.name || 'Pilih karyawan'}</h2>{activeFilter && <p className="mt-1 text-xs text-gray-400">{formatPeriod(activeFilter)}</p>}</div>
                    <div className="mt-4 min-h-0 flex-1 overflow-auto">
                        {detailLoading && <EmptyState text="Memuat detail..." />}
                        {!detailLoading && !detail && <EmptyState text="Detail akan tampil setelah karyawan dipilih." />}
                        {!detailLoading && detail && <DetailTable detail={detail} />}
                    </div>
                </section>
            </div>

            {isBackupModalOpen && createPortal(
                <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-gray-950/35 p-4 backdrop-blur-[2px]">
                    <button type="button" aria-label="Tutup modal" onClick={() => setIsBackupModalOpen(false)} className="absolute inset-0 cursor-default" />
                    <form onSubmit={submitBackupRequest} className="relative my-auto w-full max-w-lg rounded-3xl border border-gray-100 bg-white p-7 shadow-2xl">
                        <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-primary"><ShieldCheck size={22} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Pengalihan Sementara</p><h2 className="mt-1 text-xl font-black text-gray-900">Ajukan Backup Supervisor</h2></div></div><button type="button" onClick={() => setIsBackupModalOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-400"><X size={18} /></button></div>
                        <div className="mt-6 space-y-4">
                            <label className="block"><span className="mb-2 block text-xs font-bold text-gray-600">Supervisor Backup</span><SearchableSupervisorSelect value={backupForm.backup_supervisor_id} options={backupOptions} onChange={(value) => setBackupForm((current) => ({ ...current, backup_supervisor_id: value }))} /></label>
                            <div className="grid grid-cols-2 gap-4"><label><span className="mb-2 block text-xs font-bold text-gray-600">Tanggal Mulai</span><input type="date" value={backupForm.start_date} min={todayInput} onChange={(event) => setBackupForm((current) => ({ ...current, start_date: event.target.value, end_date: current.end_date < event.target.value ? event.target.value : current.end_date }))} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-primary" required /></label><label><span className="mb-2 block text-xs font-bold text-gray-600">Tanggal Berakhir</span><input type="date" value={backupForm.end_date} min={backupForm.start_date || todayInput} onChange={(event) => setBackupForm((current) => ({ ...current, end_date: event.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-primary" required /></label></div>
                            <label className="block"><span className="mb-2 block text-xs font-bold text-gray-600">Alasan (Opsional)</span><textarea value={backupForm.reason} onChange={(event) => setBackupForm((current) => ({ ...current, reason: event.target.value }))} rows={3} maxLength={1000} className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-primary" /></label>
                        </div>
                        <button type="submit" disabled={backupBusyId === 0 || !backupForm.backup_supervisor_id} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-black text-white disabled:opacity-50">{backupBusyId === 0 ? <Clock3 size={17} className="animate-spin" /> : <Check size={17} />}{backupBusyId === 0 ? 'Mengirim...' : 'Kirim Pengajuan'}</button>
                    </form>
                </div>, document.body,
            )}
        </div>
    );
}

function ReportFilterForm({ mode, dailyFilter, monthlyFilter, setDailyFilter, setMonthlyFilter, loading, onSubmit }: {
    mode: ReportMode; dailyFilter: DailyFilter; monthlyFilter: MonthlyFilter;
    setDailyFilter: React.Dispatch<React.SetStateAction<DailyFilter>>;
    setMonthlyFilter: React.Dispatch<React.SetStateAction<MonthlyFilter>>;
    loading: boolean; onSubmit: (event: FormEvent) => void;
}) {
    return (
        <form onSubmit={onSubmit} className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-3">
            {mode === 'daily' ? (
                <ReportPeriodPicker
                    key="daily"
                    mode="daily"
                    start={dailyFilter.start}
                    end={dailyFilter.end}
                    max={toDateInput(new Date())}
                    onChange={(start, end) => setDailyFilter({ mode: 'daily', start, end })}
                />
            ) : (
                <ReportPeriodPicker
                    key="monthly"
                    mode="monthly"
                    start={monthlyFilter.start}
                    end={monthlyFilter.end}
                    max={defaultMonthlyFilter().end}
                    onChange={(start, end) => setMonthlyFilter({ mode: 'monthly', start, end })}
                />
            )}
            <button disabled={loading} className="min-h-[52px] rounded-xl bg-primary px-4 py-3 text-xs font-black text-white disabled:opacity-50">{loading ? 'Memuat...' : 'Tampilkan'}</button>
        </form>
    );
}

function MemberRow({ member, index, mode, selected, onClick }: { member: TeamScoreMember; index: number; mode: ReportMode; selected: boolean; onClick: () => void }) {
    const daily = mode === 'daily' ? member as DailyMemberScore : null;
    const monthly = mode === 'monthly' ? member as MonthlyMemberScore : null;
    const metricClass = 'min-w-[72px] rounded-xl bg-white px-2 py-2 text-center shadow-sm';
    return <button type="button" onClick={onClick} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? 'border-primary bg-purple-50 shadow-sm' : 'border-gray-100 hover:border-purple-200 hover:bg-gray-50'}`}><div className="flex items-center gap-3"><p className="min-w-0 flex-1 truncate text-sm font-black text-gray-800">{index + 1}. {member.id} - {member.name}</p><div className="flex flex-shrink-0 items-stretch gap-2">{daily ? <><span className={metricClass}><small className="block text-[8px] font-bold leading-tight text-gray-400">Total Tugas<br />Approve</small><strong className="mt-1 block text-xs text-gray-700">{daily.approved_tasks}</strong></span><span className={metricClass}><small className="block text-[8px] font-bold leading-tight text-gray-400">Total Tugas<br />Not Approve</small><strong className="mt-1 block text-xs text-gray-700">{daily.unapproved_tasks}</strong></span></> : monthly && <><span className={metricClass}><small className="block text-[8px] font-bold leading-tight text-gray-400">Nilai Tugas</small><strong className="mt-2 block text-xs text-gray-700">{formatScore(monthly.task_score)}</strong></span><span className={metricClass}><small className="block text-[8px] font-bold leading-tight text-gray-400">Nilai Absensi</small><strong className="mt-2 block text-xs text-gray-700">{formatScore(monthly.attendance_score)}</strong></span><span className={metricClass}><small className="block text-[8px] font-bold leading-tight text-gray-400">Nilai Evaluasi</small><strong className="mt-2 block text-xs text-gray-700">{formatScore(monthly.evaluation_score)}</strong></span></>}<span className="flex min-w-[72px] items-center justify-center rounded-xl bg-white px-3 py-2 text-sm font-black text-primary shadow-sm">{formatScore(daily?.score ?? monthly?.total_score)}</span></div></div></button>;
}

function DetailTable({ detail }: { detail: TeamScoreDetail }) {
    if (detail.mode === 'daily') {
        const rows = detail.rows as DailyDetailRow[];
        return <table className="w-full min-w-[520px] border-separate border-spacing-0 text-xs"><thead className="sticky top-0 bg-white"><tr>{['Tanggal', 'Approve', 'Belum Approve', 'Nilai'].map((label) => <th key={label} className="border-b border-gray-200 px-3 py-3 text-left font-black text-gray-500">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.date} className="odd:bg-gray-50"><td className="px-3 py-3 font-semibold text-gray-700">{formatDate(row.date)}</td><td className="px-3 py-3">{row.approved_tasks}</td><td className="px-3 py-3">{row.unapproved_tasks}</td><td className="px-3 py-3 font-black text-primary">{formatScore(row.score)}</td></tr>)}</tbody></table>;
    }
    const rows = detail.rows as MonthlyDetailRow[];
    return <table className="w-full min-w-[650px] border-separate border-spacing-0 text-xs"><thead className="sticky top-0 bg-white"><tr>{['Bulan', 'Tugas', 'Absensi', 'Evaluasi', 'Total'].map((label) => <th key={label} className="border-b border-gray-200 px-3 py-3 text-left font-black text-gray-500">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.month} className="odd:bg-gray-50"><td className="px-3 py-3 font-semibold text-gray-700">{formatMonth(row.month)}</td><td className="px-3 py-3">{formatScore(row.task_score)}</td><td className="px-3 py-3">{formatScore(row.attendance_score)}</td><td className="px-3 py-3">{formatScore(row.evaluation_score)}</td><td className="px-3 py-3 font-black text-primary">{formatScore(row.total_score)}</td></tr>)}</tbody></table>;
}

function EmptyState({ text }: { text: string }) {
    return <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 text-center text-xs font-semibold text-gray-400">{text}</div>;
}

function BackupPaginationControls({ pagination, loading, onPageChange }: { pagination: BackupPagination; loading: boolean; onPageChange: (page: number) => void }) {
    if (pagination.last_page <= 1) return null;
    return <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3"><button type="button" disabled={loading || pagination.current_page <= 1} onClick={() => onPageChange(pagination.current_page - 1)} className="rounded-lg border border-gray-200 p-2 text-primary disabled:text-gray-300"><ChevronLeft size={14} /></button><span className="text-[11px] font-bold text-gray-400">{pagination.current_page}/{pagination.last_page}</span><button type="button" disabled={loading || pagination.current_page >= pagination.last_page} onClick={() => onPageChange(pagination.current_page + 1)} className="rounded-lg border border-gray-200 p-2 text-primary disabled:text-gray-300"><ChevronRight size={14} /></button></div>;
}

function SearchableSupervisorSelect({ value, options, onChange }: { value: string; options: BackupOption[]; onChange: (value: string) => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const selected = options.find((option) => option.id === value);
    const label = (option: BackupOption) => `${option.name}${option.locations?.length ? ` (${option.locations.join(', ')})` : ''}`;
    const filtered = options.filter((option) => label(option).toLocaleLowerCase('id-ID').includes(search.trim().toLocaleLowerCase('id-ID')));
    useEffect(() => {
        const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);
    return <div ref={ref} className="relative"><button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm"><span className={selected ? 'font-semibold text-gray-700' : 'text-gray-400'}>{selected ? label(selected) : 'Pilih supervisor'}</span><ChevronDown size={16} /></button>{open && <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"><div className="border-b border-gray-100 p-2"><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari supervisor..." className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary" /></div><div className="max-h-52 overflow-y-auto p-1">{filtered.length === 0 ? <p className="px-3 py-5 text-center text-xs text-gray-400">Supervisor tidak ditemukan.</p> : filtered.map((option) => <button key={option.id} type="button" onClick={() => { onChange(option.id); setOpen(false); }} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-gray-50">{label(option)}</button>)}</div></div>}</div>;
}
