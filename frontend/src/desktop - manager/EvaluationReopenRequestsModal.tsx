import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Clock3, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';

interface EvaluationReopenRequestsModalProps {
    open: boolean;
    onClose: () => void;
    onChanged: () => void;
}

interface ReopenRequestItem {
    id: number;
    status: string;
    attempt: number;
    evaluation_period: string;
    reason?: string | null;
    rejection_reason?: string | null;
    expires_at?: string | null;
    requester?: { id: string; name: string } | null;
    evaluatee?: { id: string; name: string } | null;
}

interface Pagination {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

type RequestTab = 'pending' | 'history';

const emptyPagination: Pagination = { current_page: 1, last_page: 1, per_page: 8, total: 0 };

const statusLabel: Record<string, string> = {
    pending: 'Menunggu',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    expired: 'Kedaluwarsa',
    completed: 'Selesai',
};

export default function EvaluationReopenRequestsModal({ open, onClose, onChanged }: EvaluationReopenRequestsModalProps) {
    const [requests, setRequests] = useState<ReopenRequestItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<number | null>(null);
    const [rejectingId, setRejectingId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<RequestTab>('pending');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState<Pagination>(emptyPagination);
    const [pendingCount, setPendingCount] = useState(0);
    const loadRequestRef = useRef(0);

    const load = async (nextPage = page, nextTab = tab, nextSearch = search) => {
        const requestId = ++loadRequestRef.current;
        setLoading(true);
        setError(null);
        try {
            const query = new URLSearchParams({ tab: nextTab, page: String(nextPage), per_page: '8' });
            if (nextSearch.trim()) query.set('search', nextSearch.trim());
            const response = await fetch(`/api/manager/evaluation-reopen-requests?${query}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}`, Accept: 'application/json' },
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message || payload?.error || `Permintaan evaluasi tidak dapat dimuat (${response.status}).`);
            if (requestId !== loadRequestRef.current) return;
            setRequests(payload.requests || []);
            setPendingCount(Number(payload.pending_count || 0));
            const nextPagination = payload.pagination || emptyPagination;
            setPagination(nextPagination);
            if (nextPage > nextPagination.last_page) setPage(Math.max(1, nextPagination.last_page));
        } catch (loadError) {
            if (requestId !== loadRequestRef.current) return;
            setRequests([]);
            setPagination(emptyPagination);
            setError(loadError instanceof Error ? loadError.message : 'Permintaan evaluasi tidak dapat dimuat.');
        } finally {
            if (requestId === loadRequestRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => load(page, tab, search), search.trim() ? 300 : 0);
        return () => {
            window.clearTimeout(timer);
            loadRequestRef.current += 1;
        };
    }, [open, page, search, tab]);

    const review = async (id: number, decision: 'approved' | 'rejected') => {
        if (decision === 'rejected' && !rejectionReason.trim()) {
            setError('Alasan penolakan wajib diisi.');
            return;
        }

        setSavingId(id);
        setError(null);
        try {
            const response = await fetch(`/api/manager/evaluation-reopen-requests/${id}/review`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ decision, rejection_reason: decision === 'rejected' ? rejectionReason.trim() : null }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message || payload?.errors?.decision?.[0] || 'Permintaan tidak dapat diproses.');
            setRejectingId(null);
            setRejectionReason('');
            await load(page, tab, search);
            onChanged();
        } catch (reviewError) {
            setError(reviewError instanceof Error ? reviewError.message : 'Permintaan tidak dapat diproses.');
        } finally {
            setSavingId(null);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5 backdrop-blur-sm">
            <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
                    <div>
                        <h2 className="text-xl font-black text-gray-900">Permintaan Perpanjangan Evaluasi</h2>
                        <p className="mt-1 text-xs text-gray-400">Persetujuan membuka formulir selama 24 jam.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100"><X size={20} /></button>
                </div>

                <div className="space-y-3 border-b border-gray-100 bg-white px-5 py-4">
                    <div className="grid grid-cols-2 rounded-xl bg-gray-50 p-1">
                        <button type="button" onClick={() => { setTab('pending'); setPage(1); setRejectingId(null); setRejectionReason(''); }} className={`relative rounded-lg px-3 py-2.5 text-xs font-black transition ${tab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}>
                            Menunggu
                            {pendingCount > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white">{pendingCount > 99 ? '99+' : pendingCount}</span>}
                        </button>
                        <button type="button" onClick={() => { setTab('history'); setPage(1); setRejectingId(null); setRejectionReason(''); }} className={`rounded-lg px-3 py-2.5 text-xs font-black transition ${tab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}>
                            Riwayat
                        </button>
                    </div>
                    <label className="relative block">
                        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Cari NIK atau nama crew/supervisor..." className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:bg-white" />
                    </label>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-5">
                    {loading && <div className="flex justify-center py-16 text-primary"><LoaderCircle className="animate-spin" /></div>}
                    {!loading && error && (
                        <div className="rounded-2xl border border-red-100 bg-white p-6 text-center shadow-sm">
                            <AlertCircle className="mx-auto text-red-400" size={28} />
                            <p className="mt-3 text-sm font-bold text-gray-700">Permintaan evaluasi belum dapat dimuat</p>
                            <p className="mt-1 text-xs text-red-500">{error}</p>
                            <button type="button" onClick={() => load(page, tab, search)} className="mx-auto mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white">
                                <RefreshCw size={14} /> Coba Lagi
                            </button>
                        </div>
                    )}
                    {!loading && !error && requests.length === 0 && <div className="rounded-2xl bg-white py-16 text-center text-sm text-gray-400">{search.trim() ? 'Permintaan tidak ditemukan.' : tab === 'pending' ? 'Tidak ada permintaan yang menunggu.' : 'Belum ada riwayat permintaan.'}</div>}
                    {!loading && requests.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-black text-gray-800">{item.evaluatee?.id} - {item.evaluatee?.name}</p>
                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.status === 'pending' ? 'bg-amber-50 text-amber-600' : item.status === 'approved' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{statusLabel[item.status] || item.status}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">Supervisor: {item.requester?.id} - {item.requester?.name}</p>
                                    <p className="mt-1 text-xs text-gray-400">Periode {new Date(`${item.evaluation_period}T12:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} - Pengajuan {item.attempt}/3</p>
                                    {item.reason && <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">{item.reason}</p>}
                                    {item.rejection_reason && <p className="mt-3 text-xs font-semibold text-red-500">Alasan ditolak: {item.rejection_reason}</p>}
                                    {item.expires_at && item.status === 'approved' && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-green-600"><Clock3 size={13} /> Aktif sampai {new Date(item.expires_at).toLocaleString('id-ID')}</p>}
                                </div>

                                {item.status === 'pending' && rejectingId !== item.id && (
                                    <div className="flex gap-2">
                                        <button type="button" disabled={savingId === item.id} onClick={() => review(item.id, 'approved')} className="flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Check size={14} /> Setujui</button>
                                        <button type="button" disabled={savingId === item.id} onClick={() => { setRejectingId(item.id); setRejectionReason(''); }} className="rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-500">Tolak</button>
                                    </div>
                                )}
                            </div>

                            {item.status === 'pending' && rejectingId === item.id && (
                                <div className="mt-4 rounded-2xl bg-red-50 p-4">
                                    <label className="text-xs font-black text-red-600">Alasan penolakan</label>
                                    <textarea autoFocus value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-xl border border-red-100 bg-white p-3 text-sm outline-none focus:border-red-300" />
                                    <div className="mt-3 flex justify-end gap-2">
                                        <button type="button" onClick={() => setRejectingId(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-gray-500">Batal</button>
                                        <button type="button" disabled={savingId === item.id} onClick={() => review(item.id, 'rejected')} className="rounded-xl bg-red-500 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Konfirmasi Tolak</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 bg-white px-5 py-4">
                    <p className="text-[11px] font-bold text-gray-400">{pagination.total} data</p>
                    <div className="flex items-center gap-3">
                        <button type="button" disabled={loading || pagination.current_page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-gray-200 p-2 text-primary disabled:text-gray-300"><ChevronLeft size={15} /></button>
                        <span className="min-w-[72px] text-center text-[11px] font-bold text-gray-400">{pagination.current_page}/{pagination.last_page}</span>
                        <button type="button" disabled={loading || pagination.current_page >= pagination.last_page} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-gray-200 p-2 text-primary disabled:text-gray-300"><ChevronRight size={15} /></button>
                    </div>
                </div>
            </div>
        </div>
    );
}
