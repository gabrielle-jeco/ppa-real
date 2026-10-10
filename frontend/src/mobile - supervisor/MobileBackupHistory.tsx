import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import MobileLayout from './MobileLayout';

type Person = { id: string; name: string };
type BackupRequest = {
    id: number; requester: Person; backup_supervisor: Person;
    start_date: string; end_date: string; reason?: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    is_active: boolean; crew_count: number;
};
type Pagination = { current_page: number; last_page: number; total: number };
type Payload = {
    outgoing: BackupRequest[]; incoming: BackupRequest[];
    pagination: { outgoing: Pagination; incoming: Pagination };
    pending_incoming_count: number;
};
const emptyPage = { current_page: 1, last_page: 1, total: 0 };
const emptyPayload: Payload = { outgoing: [], incoming: [], pagination: { outgoing: emptyPage, incoming: emptyPage }, pending_incoming_count: 0 };
const statusLabel = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak', expired: 'Selesai' };
const statusClass = { pending: 'bg-amber-50 text-amber-700', approved: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-600', expired: 'bg-gray-100 text-gray-500' };
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

async function apiError(response: Response) {
    try { const payload = await response.json(); return String(payload?.message || 'Permintaan tidak dapat diproses.'); }
    catch { return 'Permintaan tidak dapat diproses.'; }
}

export default function MobileBackupHistory({ onBack }: { onBack: () => void }) {
    const [tab, setTab] = useState<'outgoing' | 'incoming'>('outgoing');
    const [payload, setPayload] = useState<Payload>(emptyPayload);
    const [pages, setPages] = useState({ outgoing: 1, incoming: 1 });
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = async (nextPages = pages) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/supervisor/backups?outgoing_page=${nextPages.outgoing}&incoming_page=${nextPages.incoming}&per_page=8`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}`, Accept: 'application/json' },
            });
            if (!response.ok) throw new Error(await apiError(response));
            const next: Payload = await response.json();
            setPayload(next);
            setPages({ outgoing: next.pagination.outgoing.current_page, incoming: next.pagination.incoming.current_page });
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Riwayat backup gagal dimuat.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load({ outgoing: 1, incoming: 1 }); }, []);

    const respond = async (id: number, decision: 'approved' | 'rejected') => {
        setBusyId(id);
        try {
            const response = await fetch(`/api/supervisor/backups/${id}/respond`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}`, Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision }),
            });
            if (!response.ok) throw new Error(await apiError(response));
            await load(pages);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Keputusan backup gagal disimpan.');
        } finally {
            setBusyId(null);
        }
    };

    const requests = payload[tab];
    const pagination = payload.pagination[tab];

    return (
        <MobileLayout title="Riwayat Backup" onBack={onBack}>
            <div className="pb-5">
                <div className="mb-4 grid grid-cols-2 rounded-2xl bg-white p-1.5 shadow-sm">
                    <button type="button" onClick={() => setTab('outgoing')} className={`rounded-xl px-2 py-3 text-xs font-black ${tab === 'outgoing' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Pengajuan Saya</button>
                    <button type="button" onClick={() => setTab('incoming')} className={`relative rounded-xl px-2 py-3 text-xs font-black ${tab === 'incoming' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Permintaan Masuk{payload.pending_incoming_count > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white">{payload.pending_incoming_count}</span>}</button>
                </div>
                {loading && <State text="Memuat riwayat backup..." />}
                {error && <State text={error} error />}
                {!loading && !error && requests.length === 0 && <State text="Belum ada data backup." />}
                <div className="space-y-3">{!loading && requests.map((request) => {
                    const person = tab === 'outgoing' ? request.backup_supervisor : request.requester;
                    return <article key={request.id} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-gray-800">{person.name}</p><p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-gray-400"><CalendarDays size={13} />{formatDate(request.start_date)} - {formatDate(request.end_date)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusClass[request.status]}`}>{request.is_active ? 'Aktif' : statusLabel[request.status]}</span></div>{request.reason && <p className="mt-3 text-xs leading-5 text-gray-500">{request.reason}</p>}{tab === 'incoming' && request.status === 'pending' && <div className="mt-4 grid grid-cols-2 gap-2"><button disabled={busyId === request.id} onClick={() => respond(request.id, 'rejected')} className="rounded-xl bg-red-50 py-2.5 text-xs font-black text-red-600 disabled:opacity-50">Tolak</button><button disabled={busyId === request.id} onClick={() => respond(request.id, 'approved')} className="rounded-xl bg-green-600 py-2.5 text-xs font-black text-white disabled:opacity-50">Setujui</button></div>}</article>;
                })}</div>
                {pagination.last_page > 1 && <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm"><button disabled={loading || pagination.current_page <= 1} onClick={() => load({ ...pages, [tab]: pagination.current_page - 1 })} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-black text-blue-600 disabled:text-gray-300">Sebelumnya</button><span className="text-xs font-bold text-gray-400">{pagination.current_page}/{pagination.last_page}</span><button disabled={loading || pagination.current_page >= pagination.last_page} onClick={() => load({ ...pages, [tab]: pagination.current_page + 1 })} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-black text-blue-600 disabled:text-gray-300">Berikutnya</button></div>}
            </div>
        </MobileLayout>
    );
}

function State({ text, error = false }: { text: string; error?: boolean }) {
    return <div className={`rounded-3xl border px-5 py-10 text-center text-xs font-semibold ${error ? 'border-red-100 bg-red-50 text-red-600' : 'border-gray-100 bg-white text-gray-400'}`}>{text}</div>;
}

