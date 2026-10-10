import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronRight, Edit3, LoaderCircle, Plus, Search, ShoppingBasket, UserRound, X } from 'lucide-react';
import MobileLayout from './MobileLayout';
import {
    createPushSellingCampaign,
    fetchCashierOverview,
    fetchPushSellingCampaigns,
    saveCashierId,
    updatePushSellingCampaign,
    type CashierOverview,
    type CampaignPage,
    type PushSellingCampaign,
    type PushSellingCampaignInput,
} from '../utils/cashier';

const today = () => {
    const date = new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const emptyForm = (): PushSellingCampaignInput => ({
    plu: '', product_name: '', start_date: today(), end_date: today(), is_active: true,
});
const emptyPage: CampaignPage = {
    data: [], pagination: { current_page: 1, last_page: 1, per_page: 10, total: 0 },
};
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
});

export default function MobileSupervisorCashier({ onBack, onSelect }: {
    onBack: () => void;
    onSelect: (campaign: PushSellingCampaign) => void;
}) {
    const [overview, setOverview] = useState<CashierOverview | null>(null);
    const [campaigns, setCampaigns] = useState<CampaignPage>(emptyPage);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sheet, setSheet] = useState<'cashier' | 'campaign' | null>(null);
    const [selectedCrewId, setSelectedCrewId] = useState('');
    const [crewSearch, setCrewSearch] = useState('');
    const [cashierId, setCashierId] = useState('');
    const [editingCampaign, setEditingCampaign] = useState<PushSellingCampaign | null>(null);
    const [campaignForm, setCampaignForm] = useState<PushSellingCampaignInput>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const loadOverview = async () => {
        const payload = await fetchCashierOverview();
        setOverview(payload);
        const selected = payload.crew.find((crew) => crew.id === selectedCrewId) || payload.crew[0];
        if (selected) {
            setSelectedCrewId(selected.id);
            setCashierId(selected.cashier_id || '');
        }
    };

    const loadCampaigns = async (targetPage = page) => {
        const payload = await fetchPushSellingCampaigns(search, 'all', targetPage);
        setCampaigns(payload);
    };

    useEffect(() => {
        fetchCashierOverview()
            .then((payload) => {
                setOverview(payload);
                const first = payload.crew[0];
                if (first) {
                    setSelectedCrewId(first.id);
                    setCashierId(first.cashier_id || '');
                }
            })
            .catch((error) => setFeedback({ type: 'error', message: error.message }));
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setLoading(true);
            setPage(1);
            fetchPushSellingCampaigns(search, 'all', 1)
                .then(setCampaigns)
                .catch((error) => setFeedback({ type: 'error', message: error.message }))
                .finally(() => setLoading(false));
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [search]);

    const filteredCrew = overview?.crew.filter((crew) => {
        const term = crewSearch.trim().toLocaleLowerCase('id-ID');
        return !term || `${crew.id} ${crew.name}`.toLocaleLowerCase('id-ID').includes(term);
    }) ?? [];

    const openCashierSheet = () => {
        const selected = overview?.crew.find((crew) => crew.id === selectedCrewId) || overview?.crew[0];
        if (selected) {
            setSelectedCrewId(selected.id);
            setCashierId(selected.cashier_id || '');
        }
        setCrewSearch('');
        setSheet('cashier');
    };

    const openCampaignSheet = (campaign?: PushSellingCampaign) => {
        setEditingCampaign(campaign || null);
        setCampaignForm(campaign ? {
            plu: campaign.plu,
            product_name: campaign.product_name,
            start_date: campaign.start_date,
            end_date: campaign.end_date,
            is_active: campaign.is_active,
        } : emptyForm());
        setSheet('campaign');
    };

    const submitCashierId = async (event: FormEvent) => {
        event.preventDefault();
        if (!selectedCrewId) return;
        setSaving(true);
        try {
            await saveCashierId(selectedCrewId, cashierId);
            await loadOverview();
            setSheet(null);
            setFeedback({ type: 'success', message: 'ID kasir berhasil disimpan.' });
        } catch (error) {
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'ID kasir gagal disimpan.' });
        } finally {
            setSaving(false);
        }
    };

    const submitCampaign = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            if (editingCampaign) await updatePushSellingCampaign(editingCampaign.id, campaignForm);
            else await createPushSellingCampaign(campaignForm);
            await loadCampaigns(1);
            setPage(1);
            setSheet(null);
            setFeedback({ type: 'success', message: editingCampaign ? 'Campaign berhasil diperbarui.' : 'Campaign berhasil dibuat.' });
        } catch (error) {
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Campaign gagal disimpan.' });
        } finally {
            setSaving(false);
        }
    };

    const changePage = async (target: number) => {
        setLoading(true);
        try {
            await loadCampaigns(target);
            setPage(target);
        } catch (error) {
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Campaign gagal dimuat.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <MobileLayout title="Push Selling Kasir" onBack={onBack} allowScroll>
            {feedback && <div className={`mb-4 flex items-start justify-between gap-3 rounded-2xl px-4 py-3 text-xs font-semibold ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}><span>{feedback.message}</span><button type="button" onClick={() => setFeedback(null)}><X size={15} /></button></div>}

            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><UserRound size={21} /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Mapping Beyond</p><h2 className="mt-1 font-black text-gray-800">ID Kasir</h2><p className="mt-1 truncate text-xs text-gray-400">{overview?.location.name || 'Memuat cabang...'}</p></div></div>
                <button type="button" onClick={openCashierSheet} disabled={!overview?.crew.length} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-black text-white shadow-sm disabled:opacity-50"><Edit3 size={16} />Atur ID Kasir</button>
            </section>

            <section className="mt-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Campaign Cabang</p><h2 className="mt-1 font-black text-gray-800">Tugas Push Selling</h2></div><button type="button" onClick={() => openCampaignSheet()} className="flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white"><Plus size={15} />Baru</button></div>
                <label className="relative mt-4 block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari PLU atau produk..." className="w-full rounded-2xl border border-gray-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500" /></label>
            </section>

            <div className="mt-4 space-y-3">
                {loading ? <div className="flex h-40 items-center justify-center text-blue-500"><LoaderCircle className="animate-spin" /></div> : campaigns.data.length === 0 ? <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center text-sm font-semibold text-gray-400">Belum ada campaign push selling.</div> : campaigns.data.map((campaign) => (
                    <article key={campaign.id} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                        <button type="button" onClick={() => onSelect(campaign)} className="w-full text-left">
                            <div className="flex items-start gap-3"><div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><ShoppingBasket size={19} /></div><div className="min-w-0 flex-1"><p className="text-xs font-black text-blue-600">{campaign.plu}</p><h3 className="mt-1 text-sm font-black leading-5 text-gray-800">{campaign.product_name}</h3><div className="mt-2 flex items-center gap-1 text-[11px] text-gray-400"><CalendarDays size={12} /><span>{formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}</span></div></div><div className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full ${campaign.is_active ? 'bg-green-500' : 'bg-gray-300'}`} /><ChevronRight size={18} className="text-gray-300" /></div></div>
                            <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-gray-50 px-3 py-3"><span className="block text-[9px] font-bold uppercase text-gray-400">Total Sales Qty</span><strong className="mt-1 block text-base text-gray-400">-</strong></div><div className="rounded-2xl bg-gray-50 px-3 py-3"><span className="block text-[9px] font-bold uppercase text-gray-400">Status</span><strong className={`mt-1 block text-xs ${campaign.is_active ? 'text-green-600' : 'text-gray-500'}`}>{campaign.is_active ? 'Aktif' : 'Nonaktif'}</strong></div></div>
                        </button>
                        <button type="button" onClick={() => openCampaignSheet(campaign)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-100 py-2.5 text-xs font-black text-blue-600"><Edit3 size={14} />Edit Campaign</button>
                    </article>
                ))}
            </div>

            {campaigns.pagination.last_page > 1 && <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm"><button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-blue-600 disabled:text-gray-300">Sebelumnya</button><span className="text-xs font-bold text-gray-400">{page}/{campaigns.pagination.last_page}</span><button type="button" disabled={page >= campaigns.pagination.last_page} onClick={() => changePage(page + 1)} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-blue-600 disabled:text-gray-300">Berikutnya</button></div>}

            <BottomSheet open={sheet === 'cashier'} onClose={() => setSheet(null)} title="Atur ID Kasir">
                <form onSubmit={submitCashierId} className="space-y-4">
                    <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} /><input value={crewSearch} onChange={(event) => setCrewSearch(event.target.value)} placeholder="Cari nama atau NIK..." className="w-full rounded-2xl border border-gray-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500" /></label>
                    <select value={selectedCrewId} onChange={(event) => { const crew = overview?.crew.find((item) => item.id === event.target.value); setSelectedCrewId(event.target.value); setCashierId(crew?.cashier_id || ''); }} className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"><option value="">Pilih karyawan</option>{filteredCrew.map((crew) => <option key={crew.id} value={crew.id}>{crew.id} - {crew.name}</option>)}</select>
                    <label className="block"><span className="mb-2 block text-xs font-bold text-gray-500">ID Kasir Beyond</span><input value={cashierId} onChange={(event) => setCashierId(event.target.value)} maxLength={64} placeholder="Belum diatur" className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-500" /></label>
                    <button disabled={saving || !selectedCrewId} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white disabled:opacity-50">{saving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}{saving ? 'Menyimpan...' : 'Simpan ID Kasir'}</button>
                </form>
            </BottomSheet>

            <BottomSheet open={sheet === 'campaign'} onClose={() => setSheet(null)} title={editingCampaign ? 'Edit Campaign' : 'Campaign Baru'}>
                <form onSubmit={submitCampaign} className="space-y-4">
                    <label className="block"><span className="mb-2 block text-xs font-bold text-gray-500">PLU Produk</span><input required value={campaignForm.plu} onChange={(event) => setCampaignForm((current) => ({ ...current, plu: event.target.value }))} className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500" /></label>
                    <label className="block"><span className="mb-2 block text-xs font-bold text-gray-500">Nama Produk</span><textarea required rows={3} value={campaignForm.product_name} onChange={(event) => setCampaignForm((current) => ({ ...current, product_name: event.target.value }))} className="w-full resize-none rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500" /></label>
                    <div className="grid grid-cols-2 gap-3"><label><span className="mb-2 block text-xs font-bold text-gray-500">Mulai</span><input required type="date" value={campaignForm.start_date} onChange={(event) => setCampaignForm((current) => ({ ...current, start_date: event.target.value, end_date: current.end_date < event.target.value ? event.target.value : current.end_date }))} className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-xs outline-none focus:border-blue-500" /></label><label><span className="mb-2 block text-xs font-bold text-gray-500">Selesai</span><input required type="date" min={campaignForm.start_date} value={campaignForm.end_date} onChange={(event) => setCampaignForm((current) => ({ ...current, end_date: event.target.value }))} className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-xs outline-none focus:border-blue-500" /></label></div>
                    <label className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600"><span>Campaign aktif</span><input type="checkbox" checked={campaignForm.is_active} onChange={(event) => setCampaignForm((current) => ({ ...current, is_active: event.target.checked }))} className="h-5 w-5 accent-blue-600" /></label>
                    <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white disabled:opacity-50">{saving && <LoaderCircle size={16} className="animate-spin" />}{saving ? 'Menyimpan...' : editingCampaign ? 'Simpan Perubahan' : 'Buat Campaign'}</button>
                </form>
            </BottomSheet>
        </MobileLayout>
    );
}

function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
    const [rendered, setRendered] = useState(open);
    const [animateIn, setAnimateIn] = useState(false);

    useEffect(() => {
        if (open) {
            setRendered(true);
            const frame = window.requestAnimationFrame(() => setAnimateIn(true));
            return () => window.cancelAnimationFrame(frame);
        }
        setAnimateIn(false);
        const timeout = window.setTimeout(() => setRendered(false), 200);
        return () => window.clearTimeout(timeout);
    }, [open]);

    if (!rendered) return null;
    return createPortal(<div className={`fixed inset-0 z-[30000] flex items-end justify-center transition-colors duration-200 ${animateIn ? 'bg-black/45' : 'pointer-events-none bg-black/0'}`}><button type="button" aria-label="Tutup" onClick={onClose} className="absolute inset-0" /><div className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-[0_-12px_30px_rgba(15,23,42,0.16)] transition-[transform,opacity] duration-200 ${animateIn ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-black text-gray-800">{title}</h2><button type="button" onClick={onClose} className="rounded-full bg-gray-100 p-2 text-gray-500"><X size={18} /></button></div>{children}</div></div>, document.body);
}
