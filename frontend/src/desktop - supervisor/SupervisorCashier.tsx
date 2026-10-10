import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
    BadgeDollarSign, CalendarDays, Check, ChevronLeft, ChevronRight, Edit3,
    LoaderCircle, Plus, Search, Store, UserRound, X,
} from 'lucide-react';
import {
    createPushSellingCampaign,
    fetchCashierOverview,
    fetchPushSellingCampaignDetail,
    fetchPushSellingCampaigns,
    saveCashierId,
    updatePushSellingCampaign,
    type CashierOverview,
    type CampaignPage,
    type PushSellingCampaign,
    type PushSellingCampaignDetail,
    type PushSellingCampaignInput,
} from '../utils/cashier';

const today = () => {
    const date = new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const emptyCampaignForm = (): PushSellingCampaignInput => ({
    plu: '', product_name: '', start_date: today(), end_date: today(), is_active: true,
});
const emptyPage: CampaignPage = {
    data: [], pagination: { current_page: 1, last_page: 1, per_page: 10, total: 0 },
};
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
});

export default function SupervisorCashier() {
    const [overview, setOverview] = useState<CashierOverview | null>(null);
    const [selectedCrewId, setSelectedCrewId] = useState('');
    const [cashierId, setCashierId] = useState('');
    const [crewSearch, setCrewSearch] = useState('');
    const [cashierSaving, setCashierSaving] = useState(false);
    const [campaigns, setCampaigns] = useState<CampaignPage>(emptyPage);
    const [campaignSearch, setCampaignSearch] = useState('');
    const [campaignStatus, setCampaignStatus] = useState<'all' | 'active' | 'inactive'>('all');
    const [campaignPage, setCampaignPage] = useState(1);
    const [campaignLoading, setCampaignLoading] = useState(true);
    const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
    const [detail, setDetail] = useState<PushSellingCampaignDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<PushSellingCampaign | null>(null);
    const [campaignForm, setCampaignForm] = useState<PushSellingCampaignInput>(emptyCampaignForm);
    const [campaignSaving, setCampaignSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const selectedCrew = overview?.crew.find((crew) => crew.id === selectedCrewId) ?? null;
    const filteredCrew = overview?.crew.filter((crew) => {
        const term = crewSearch.trim().toLocaleLowerCase('id-ID');
        return !term || `${crew.id} ${crew.name}`.toLocaleLowerCase('id-ID').includes(term);
    }) ?? [];

    useEffect(() => {
        fetchCashierOverview()
            .then((payload) => {
                setOverview(payload);
                const firstCrew = payload.crew[0];
                if (firstCrew) {
                    setSelectedCrewId(firstCrew.id);
                    setCashierId(firstCrew.cashier_id || '');
                }
            })
            .catch((error) => setFeedback({ type: 'error', message: error.message }));
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(async () => {
            setCampaignLoading(true);
            try {
                const payload = await fetchPushSellingCampaigns(campaignSearch, campaignStatus, campaignPage);
                setCampaigns(payload);
                const first = payload.data[0];
                setSelectedCampaignId(first?.id ?? null);
                if (first) await loadDetail(first.id);
                else setDetail(null);
            } catch (error) {
                setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Campaign gagal dimuat.' });
            } finally {
                setCampaignLoading(false);
            }
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [campaignSearch, campaignStatus, campaignPage]);

    useEffect(() => {
        if (!feedback) return;
        const timeout = window.setTimeout(() => setFeedback(null), 5000);
        return () => window.clearTimeout(timeout);
    }, [feedback]);

    const loadDetail = async (campaignId: number) => {
        setSelectedCampaignId(campaignId);
        setDetailLoading(true);
        try {
            setDetail(await fetchPushSellingCampaignDetail(campaignId));
        } catch (error) {
            setDetail(null);
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Detail campaign gagal dimuat.' });
        } finally {
            setDetailLoading(false);
        }
    };

    const selectCrew = (crewId: string) => {
        const crew = overview?.crew.find((item) => item.id === crewId);
        setSelectedCrewId(crewId);
        setCashierId(crew?.cashier_id || '');
    };

    const submitCashierId = async (event: FormEvent) => {
        event.preventDefault();
        if (!selectedCrewId) return;
        setCashierSaving(true);
        try {
            const updated = await saveCashierId(selectedCrewId, cashierId);
            setOverview((current) => current ? {
                ...current,
                crew: current.crew.map((crew) => crew.id === updated.id ? updated : crew),
            } : current);
            setCashierId(updated.cashier_id || '');
            setFeedback({ type: 'success', message: 'ID kasir berhasil disimpan.' });
        } catch (error) {
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'ID kasir gagal disimpan.' });
        } finally {
            setCashierSaving(false);
        }
    };

    const openNewCampaign = () => {
        setEditingCampaign(null);
        setCampaignForm(emptyCampaignForm());
        setFormOpen(true);
    };

    const openEditCampaign = (campaign: PushSellingCampaign) => {
        setEditingCampaign(campaign);
        setCampaignForm({
            plu: campaign.plu,
            product_name: campaign.product_name,
            start_date: campaign.start_date,
            end_date: campaign.end_date,
            is_active: campaign.is_active,
        });
        setFormOpen(true);
    };

    const submitCampaign = async (event: FormEvent) => {
        event.preventDefault();
        setCampaignSaving(true);
        try {
            const saved = editingCampaign
                ? await updatePushSellingCampaign(editingCampaign.id, campaignForm)
                : await createPushSellingCampaign(campaignForm);
            setFormOpen(false);
            setEditingCampaign(null);
            setCampaignPage(1);
            const payload = await fetchPushSellingCampaigns(campaignSearch, campaignStatus, 1);
            setCampaigns(payload);
            await loadDetail(saved.id);
            setFeedback({ type: 'success', message: editingCampaign ? 'Campaign berhasil diperbarui.' : 'Campaign berhasil dibuat.' });
        } catch (error) {
            setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Campaign gagal disimpan.' });
        } finally {
            setCampaignSaving(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 p-8">
            <header className="mb-6 flex flex-shrink-0 items-center justify-between">
                <div><h1 className="text-2xl font-bold text-gray-800">Push Selling Kasir</h1><p className="mt-1 text-sm text-gray-400">Campaign dan realisasi kasir per cabang</p></div>
                <div className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-white shadow-sm"><BadgeDollarSign size={17} /><span className="text-sm font-bold">Kasir</span></div>
            </header>

            {feedback && <div className={`mb-4 flex flex-shrink-0 items-center justify-between rounded-2xl border px-5 py-3 text-sm font-semibold ${feedback.type === 'success' ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-600'}`}><span>{feedback.message}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Tutup"><X size={16} /></button></div>}

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,38%)_minmax(0,1fr)] grid-rows-2 gap-5 xl:grid-cols-[minmax(340px,0.8fr)_minmax(400px,1.15fr)_minmax(320px,0.9fr)] xl:grid-rows-1">
                <aside className="row-span-2 min-h-0 overflow-y-auto rounded-3xl border border-gray-100 bg-white p-5 shadow-sm xl:row-span-1">
                    <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-primary"><UserRound size={21} /></div><div><h2 className="font-black text-gray-800">ID Kasir</h2><p className="mt-1 text-xs leading-5 text-gray-400">Hubungkan karyawan dengan ID Beyond.</p></div></div>
                    <form onSubmit={submitCashierId} className="mt-5 space-y-3">
                        <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} /><input value={crewSearch} onChange={(event) => setCrewSearch(event.target.value)} placeholder="Cari nama atau NIK..." className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-primary" /></label>
                        <select value={selectedCrewId} onChange={(event) => selectCrew(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-primary">
                            <option value="">Pilih karyawan</option>
                            {filteredCrew.map((crew) => <option key={crew.id} value={crew.id}>{crew.id} - {crew.name}</option>)}
                        </select>
                        <label className="block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-gray-400">ID Kasir Beyond</span><input value={cashierId} onChange={(event) => setCashierId(event.target.value)} disabled={!selectedCrew} placeholder="Belum diatur" maxLength={64} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm outline-none focus:border-primary disabled:opacity-50" /></label>
                        <button disabled={!selectedCrew || cashierSaving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-white disabled:opacity-50">{cashierSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}{cashierSaving ? 'Menyimpan...' : 'Simpan ID Kasir'}</button>
                    </form>

                    <div className="my-6 border-t border-gray-100" />
                    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Campaign Cabang</p><h3 className="mt-1 font-black text-gray-800">Tugas Push Selling</h3></div><button type="button" onClick={formOpen ? () => setFormOpen(false) : openNewCampaign} className="flex items-center gap-1 rounded-xl bg-purple-50 px-3 py-2 text-xs font-black text-primary">{formOpen ? <X size={14} /> : <Plus size={14} />}{formOpen ? 'Tutup' : 'Baru'}</button></div>

                    {formOpen ? (
                        <form onSubmit={submitCampaign} className="mt-4 space-y-3 rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
                            <p className="text-xs font-black text-gray-700">{editingCampaign ? 'Edit Campaign' : 'Campaign Baru'}</p>
                            <input required value={campaignForm.plu} onChange={(event) => setCampaignForm((current) => ({ ...current, plu: event.target.value }))} placeholder="PLU produk" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-primary" />
                            <textarea required rows={2} value={campaignForm.product_name} onChange={(event) => setCampaignForm((current) => ({ ...current, product_name: event.target.value }))} placeholder="Nama produk" className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-primary" />
                            <div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-[10px] font-bold text-gray-400">Mulai</span><input required type="date" value={campaignForm.start_date} onChange={(event) => setCampaignForm((current) => ({ ...current, start_date: event.target.value, end_date: current.end_date < event.target.value ? event.target.value : current.end_date }))} className="w-full rounded-xl border border-gray-200 bg-white px-2 py-3 text-xs outline-none focus:border-primary" /></label><label><span className="mb-1 block text-[10px] font-bold text-gray-400">Selesai</span><input required type="date" min={campaignForm.start_date} value={campaignForm.end_date} onChange={(event) => setCampaignForm((current) => ({ ...current, end_date: event.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-2 py-3 text-xs outline-none focus:border-primary" /></label></div>
                            <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-600"><span>Campaign aktif</span><input type="checkbox" checked={campaignForm.is_active} onChange={(event) => setCampaignForm((current) => ({ ...current, is_active: event.target.checked }))} className="h-4 w-4 accent-primary" /></label>
                            <button disabled={campaignSaving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-white disabled:opacity-50">{campaignSaving && <LoaderCircle size={16} className="animate-spin" />}{campaignSaving ? 'Menyimpan...' : editingCampaign ? 'Simpan Perubahan' : 'Buat Campaign'}</button>
                        </form>
                    ) : <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-4 text-xs leading-5 text-gray-400">Campaign berlaku otomatis untuk seluruh kasir pada cabang {overview?.location.name || 'ini'}.</div>}
                </aside>

                <section className="flex min-h-0 flex-col rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Daftar Push Selling</p><h2 className="mt-1 text-lg font-black text-gray-800">{overview?.location.name || 'Campaign Cabang'}</h2></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">{campaigns.pagination.total}</span></div>
                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_130px] gap-2"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={15} /><input value={campaignSearch} onChange={(event) => { setCampaignSearch(event.target.value); setCampaignPage(1); }} placeholder="Cari PLU atau produk..." className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-primary" /></label><select value={campaignStatus} onChange={(event) => { setCampaignStatus(event.target.value as typeof campaignStatus); setCampaignPage(1); }} className="rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-500 outline-none focus:border-primary"><option value="all">Semua Status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></div>
                    <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                        {campaignLoading ? <div className="flex h-40 items-center justify-center text-gray-300"><LoaderCircle className="animate-spin" /></div> : campaigns.data.length === 0 ? <EmptyState text="Belum ada campaign push selling." /> : campaigns.data.map((campaign) => (
                            <article key={campaign.id} className={`rounded-2xl border p-4 transition ${selectedCampaignId === campaign.id ? 'border-primary bg-purple-50 shadow-sm' : 'border-gray-100 hover:border-purple-200'}`}>
                                <button type="button" onClick={() => loadDetail(campaign.id)} className="w-full text-left"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-gray-800">{campaign.plu} - {campaign.product_name}</p><div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400"><CalendarDays size={13} /><span>{formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}</span></div><p className="mt-1 text-[11px] text-gray-400">Dibuat oleh {campaign.created_by.name}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black ${campaign.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{campaign.is_active ? 'Aktif' : 'Nonaktif'}</span></div><div className="rounded-xl bg-white px-3 py-2 text-center shadow-sm"><span className="block text-[8px] font-bold uppercase text-gray-400">Total Sales Qty</span><strong className="mt-1 block text-xl text-gray-400">-</strong></div></div></button>
                                <button type="button" onClick={() => openEditCampaign(campaign)} className="mt-2 ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-400 hover:bg-white hover:text-primary"><Edit3 size={14} />Edit</button>
                            </article>
                        ))}
                    </div>
                    {campaigns.pagination.last_page > 1 && <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3"><button type="button" disabled={campaignPage <= 1 || campaignLoading} onClick={() => setCampaignPage((page) => page - 1)} className="rounded-lg border border-gray-200 p-2 text-primary disabled:text-gray-300"><ChevronLeft size={15} /></button><span className="text-xs font-bold text-gray-400">{campaigns.pagination.current_page}/{campaigns.pagination.last_page}</span><button type="button" disabled={campaignPage >= campaigns.pagination.last_page || campaignLoading} onClick={() => setCampaignPage((page) => page + 1)} className="rounded-lg border border-gray-200 p-2 text-primary disabled:text-gray-300"><ChevronRight size={15} /></button></div>}
                </section>

                <section className="flex min-h-0 flex-col rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-primary"><Store size={19} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Detail Push Selling</p><h2 className="mt-1 font-black text-gray-800">{detail?.campaign.product_name || 'Pilih campaign'}</h2></div></div>
                    <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                        {detailLoading ? <div className="flex h-40 items-center justify-center text-gray-300"><LoaderCircle className="animate-spin" /></div> : !detail ? <EmptyState text="Pilih campaign untuk melihat detail seluruh kasir cabang." /> : <>
                            <div className="rounded-2xl bg-gray-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-gray-800">{detail.campaign.plu}</p><p className="mt-1 text-xs leading-5 text-gray-500">{detail.campaign.product_name}</p><p className="mt-2 text-[11px] text-gray-400">{formatDate(detail.campaign.start_date)} - {formatDate(detail.campaign.end_date)}</p></div><div className="rounded-xl bg-white px-4 py-3 text-center shadow-sm"><span className="block text-[8px] font-bold uppercase text-gray-400">Total Cabang</span><strong className="mt-1 block text-2xl text-gray-400">{detail.sales.total_quantity ?? '-'}</strong></div></div></div>
                            <div className="mt-5"><h3 className="text-xs font-black text-gray-700">Realisasi per Kasir</h3>{detail.sales.available ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[380px] text-xs"><thead><tr className="text-left text-gray-400"><th className="pb-3">NIK</th><th className="pb-3">Nama</th><th className="pb-3 text-right">Total</th></tr></thead><tbody>{detail.sales.rows.map((row) => <tr key={row.cashier_id} className="border-t border-gray-100"><td className="py-3">{row.user_id}</td><td className="py-3 font-semibold">{row.name}</td><td className="py-3 text-right font-black text-primary">{row.quantity}</td></tr>)}</tbody></table></div> : <div className="mt-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-6 text-center text-xs font-semibold text-amber-700">{detail.sales.message}</div>}</div>
                        </>}
                    </div>
                </section>
            </div>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 text-center text-xs font-semibold text-gray-400">{text}</div>;
}
