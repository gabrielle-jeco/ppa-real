import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange, ClipboardList, History, ShieldCheck, X } from 'lucide-react';
import MobileLayout from './MobileLayout';
import ReportPeriodPicker from '../general/ReportPeriodPicker';
import useModalTransition from '../utils/useModalTransition';
import {
    defaultDailyFilter, defaultMonthlyFilter, toLocalDateInput, validateTeamScoreFilter,
    type DailyFilter, type MonthlyFilter, type TeamScoreFilter,
} from '../utils/teamScoreReport';

type BackupOption = { id: string; name: string; locations?: string[] };

interface MobileSupervisorReportProps {
    onBack: () => void;
    onNavigate: (view: 'TEAM_SCORE_RESULTS' | 'BACKUP_HISTORY', data?: unknown) => void;
}

async function apiError(response: Response) {
    try {
        const payload = await response.json();
        const validation = payload?.errors ? Object.values(payload.errors).flat().find(Boolean) : null;
        return String(validation || payload?.message || 'Permintaan tidak dapat diproses.');
    } catch {
        return 'Permintaan tidak dapat diproses.';
    }
}

export default function MobileSupervisorReport({ onBack, onNavigate }: MobileSupervisorReportProps) {
    const [modal, setModal] = useState<'daily' | 'monthly' | 'backup' | null>(null);
    const [renderedModal, setRenderedModal] = useState<'daily' | 'monthly' | 'backup'>('daily');
    const [dailyFilter, setDailyFilter] = useState<DailyFilter>(defaultDailyFilter);
    const [monthlyFilter, setMonthlyFilter] = useState<MonthlyFilter>(defaultMonthlyFilter);
    const [backupOptions, setBackupOptions] = useState<BackupOption[]>([]);
    const [backupLoading, setBackupLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const today = toLocalDateInput(new Date());
    const [backupForm, setBackupForm] = useState({ backup_supervisor_id: '', start_date: today, end_date: today, reason: '' });
    const { shouldRender, animateIn, contentRef } = useModalTransition(Boolean(modal), { duration: 200 });
    const activeModal = modal ?? renderedModal;

    useEffect(() => {
        if (modal) setRenderedModal(modal);
    }, [modal]);

    useEffect(() => {
        if (modal !== 'backup' || backupOptions.length > 0) return;
        setBackupLoading(true);
        fetch('/api/supervisor/backup-options', {
            headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}`, Accept: 'application/json' },
        })
            .then(async (response) => {
                if (!response.ok) throw new Error(await apiError(response));
                setBackupOptions(await response.json());
            })
            .catch((error) => setMessage(error instanceof Error ? error.message : 'Daftar supervisor gagal dimuat.'))
            .finally(() => setBackupLoading(false));
    }, [modal, backupOptions.length]);

    const openResults = (filter: TeamScoreFilter) => {
        const validationMessage = validateTeamScoreFilter(filter);
        if (validationMessage) {
            setMessage(validationMessage);
            return;
        }
        setModal(null);
        onNavigate('TEAM_SCORE_RESULTS', { filter });
    };

    const submitBackup = async (event: FormEvent) => {
        event.preventDefault();
        setBackupLoading(true);
        setMessage(null);
        try {
            const response = await fetch('/api/supervisor/backups', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(backupForm),
            });
            if (!response.ok) throw new Error(await apiError(response));
            setModal(null);
            setMessage('Pengajuan backup berhasil dikirim.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Pengajuan backup gagal dikirim.');
        } finally {
            setBackupLoading(false);
        }
    };

    return (
        <MobileLayout title="Laporan Performa" onBack={onBack}>
            <div className="space-y-4 pb-5">
                {message && <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">{message}</div>}

                <section className="rounded-3xl bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Nilai Tim Saya</p>
                    <h2 className="mt-1 text-lg font-black text-gray-800">Pilih laporan nilai</h2>
                    <p className="mt-1 text-xs leading-5 text-gray-400">Filter periode, lalu lihat ringkasan dan detail setiap karyawan.</p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <ActionButton icon={<ClipboardList size={20} />} label="Nilai Harian" onClick={() => setModal('daily')} />
                        <ActionButton icon={<CalendarRange size={20} />} label="Nilai Bulanan" onClick={() => setModal('monthly')} />
                    </div>
                </section>

                <section className="rounded-3xl bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Pengalihan Sementara</p>
                    <h2 className="mt-1 text-lg font-black text-gray-800">Backup Supervisor</h2>
                    <p className="mt-1 text-xs leading-5 text-gray-400">Ajukan pengganti atau pantau pengajuan dan permintaan masuk.</p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <ActionButton icon={<ShieldCheck size={20} />} label="Ajukan Backup" onClick={() => setModal('backup')} />
                        <ActionButton icon={<History size={20} />} label="Riwayat Backup" onClick={() => onNavigate('BACKUP_HISTORY')} secondary />
                    </div>
                </section>
            </div>

            {shouldRender && createPortal(
                <div className={`fixed inset-0 z-[30000] flex items-end justify-center transition-colors duration-200 ease-out ${animateIn ? 'bg-black/45' : 'pointer-events-none bg-black/0'}`}>
                    <button type="button" className="absolute inset-0" aria-label="Tutup" onClick={() => setModal(null)} />
                    <div ref={contentRef} className={`relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 shadow-[0_-12px_30px_rgba(15,23,42,0.16)] transition-[transform,opacity] duration-200 ease-out will-change-transform ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
                        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-blue-600" />
                        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">{activeModal === 'backup' ? 'Pengalihan Sementara' : 'Filter Periode'}</p><h2 className="mt-1 text-lg font-black text-gray-800">{activeModal === 'daily' ? 'Nilai Harian' : activeModal === 'monthly' ? 'Nilai Bulanan' : 'Ajukan Backup'}</h2></div><button type="button" onClick={() => setModal(null)} className="rounded-full bg-gray-100 p-2 text-gray-500"><X size={18} /></button></div>
                        {activeModal === 'daily' && <DailyForm filter={dailyFilter} setFilter={setDailyFilter} onSubmit={() => openResults(dailyFilter)} />}
                        {activeModal === 'monthly' && <MonthlyForm filter={monthlyFilter} setFilter={setMonthlyFilter} onSubmit={() => openResults(monthlyFilter)} />}
                        {activeModal === 'backup' && (
                            <form onSubmit={submitBackup} className="mt-5 space-y-3">
                                <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-600">Supervisor Backup</span><select required value={backupForm.backup_supervisor_id} onChange={(event) => setBackupForm((current) => ({ ...current, backup_supervisor_id: event.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-600"><option value="">Pilih supervisor</option>{backupOptions.map((option) => <option key={option.id} value={option.id}>{option.name}{option.locations?.length ? ` - ${option.locations.join(', ')}` : ''}</option>)}</select></label>
                                <div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-xs font-bold text-gray-600">Mulai</span><input required type="date" min={today} value={backupForm.start_date} onChange={(event) => setBackupForm((current) => ({ ...current, start_date: event.target.value, end_date: current.end_date < event.target.value ? event.target.value : current.end_date }))} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs outline-none focus:border-blue-600" /></label><label><span className="mb-1.5 block text-xs font-bold text-gray-600">Selesai</span><input required type="date" min={backupForm.start_date} value={backupForm.end_date} onChange={(event) => setBackupForm((current) => ({ ...current, end_date: event.target.value }))} className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs outline-none focus:border-blue-600" /></label></div>
                                <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-600">Alasan (Opsional)</span><textarea rows={3} maxLength={1000} value={backupForm.reason} onChange={(event) => setBackupForm((current) => ({ ...current, reason: event.target.value }))} className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-600" /></label>
                                <button disabled={backupLoading || !backupForm.backup_supervisor_id} className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white disabled:opacity-50">{backupLoading ? 'Mengirim...' : 'Kirim Pengajuan'}</button>
                            </form>
                        )}
                    </div>
                </div>, document.body,
            )}
        </MobileLayout>
    );
}

function ActionButton({ icon, label, onClick, secondary = false }: { icon: React.ReactNode; label: string; onClick: () => void; secondary?: boolean }) {
    return <button type="button" onClick={onClick} className={`flex min-h-24 flex-col items-start justify-between rounded-2xl p-4 text-left transition active:scale-[0.98] ${secondary ? 'border border-gray-200 bg-gray-50 text-gray-700' : 'bg-blue-600 text-white shadow-lg shadow-blue-100'}`}><span className={secondary ? 'text-blue-600' : 'text-white'}>{icon}</span><span className="text-xs font-black">{label}</span></button>;
}

function DailyForm({ filter, setFilter, onSubmit }: { filter: DailyFilter; setFilter: React.Dispatch<React.SetStateAction<DailyFilter>>; onSubmit: () => void }) {
    return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="mt-5 space-y-3"><ReportPeriodPicker mode="daily" start={filter.start} end={filter.end} max={toLocalDateInput(new Date())} onChange={(start, end) => setFilter({ mode: 'daily', start, end })} accent="blue" inline /><p className="text-[11px] leading-5 text-gray-400">Rentang maksimal 31 hari kalender dan tidak boleh melewati hari ini.</p><button className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white">Tampilkan</button></form>;
}

function MonthlyForm({ filter, setFilter, onSubmit }: { filter: MonthlyFilter; setFilter: React.Dispatch<React.SetStateAction<MonthlyFilter>>; onSubmit: () => void }) {
    return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="mt-5 space-y-3"><ReportPeriodPicker mode="monthly" start={filter.start} end={filter.end} max={defaultMonthlyFilter().end} onChange={(start, end) => setFilter({ mode: 'monthly', start, end })} accent="blue" inline /><p className="text-[11px] leading-5 text-gray-400">Rentang maksimal 12 bulan dan hanya bulan yang sudah selesai.</p><button className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white">Tampilkan</button></form>;
}
