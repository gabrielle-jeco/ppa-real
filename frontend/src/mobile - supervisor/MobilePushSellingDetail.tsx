import { useEffect, useState } from 'react';
import { CalendarDays, LoaderCircle, ShoppingBasket } from 'lucide-react';
import MobileLayout from './MobileLayout';
import { fetchPushSellingCampaignDetail, type PushSellingCampaignDetail } from '../utils/cashier';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
});

export default function MobilePushSellingDetail({ campaignId, onBack }: { campaignId: number; onBack: () => void }) {
    const [detail, setDetail] = useState<PushSellingCampaignDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchPushSellingCampaignDetail(campaignId)
            .then(setDetail)
            .catch((reason) => setError(reason instanceof Error ? reason.message : 'Detail campaign gagal dimuat.'))
            .finally(() => setLoading(false));
    }, [campaignId]);

    return <MobileLayout title="Detail Push Selling" onBack={onBack} allowScroll>
        {loading ? <div className="flex h-60 items-center justify-center text-blue-500"><LoaderCircle className="animate-spin" /></div> : error ? <div className="rounded-3xl bg-red-50 px-5 py-8 text-center text-sm font-semibold text-red-600">{error}</div> : detail && <>
            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><ShoppingBasket size={21} /></div><div className="min-w-0 flex-1"><p className="text-xs font-black text-blue-600">{detail.campaign.plu}</p><h2 className="mt-1 text-base font-black leading-6 text-gray-800">{detail.campaign.product_name}</h2><div className="mt-2 flex items-center gap-1 text-xs text-gray-400"><CalendarDays size={13} /><span>{formatDate(detail.campaign.start_date)} - {formatDate(detail.campaign.end_date)}</span></div></div></div>
                <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-gray-50 px-4 py-4"><span className="block text-[9px] font-bold uppercase text-gray-400">Total Cabang</span><strong className="mt-1 block text-2xl text-gray-400">{detail.sales.total_quantity ?? '-'}</strong></div><div className="rounded-2xl bg-gray-50 px-4 py-4"><span className="block text-[9px] font-bold uppercase text-gray-400">Status</span><strong className={`mt-2 block text-sm ${detail.campaign.is_active ? 'text-green-600' : 'text-gray-500'}`}>{detail.campaign.is_active ? 'Aktif' : 'Nonaktif'}</strong></div></div>
            </section>
            <section className="mt-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Seluruh Kasir Cabang</p><h2 className="mt-1 font-black text-gray-800">Realisasi per Kasir</h2>
                {detail.sales.available ? <div className="mt-4 space-y-2">{detail.sales.rows.map((row, index) => <div key={row.cashier_id} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-600">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-gray-800">{row.name}</p><p className="mt-1 text-[11px] text-gray-400">{row.user_id}</p></div><strong className="text-lg text-blue-600">{row.quantity}</strong></div>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-5 py-10 text-center text-sm font-semibold text-amber-700">{detail.sales.message}</div>}
            </section>
        </>}
    </MobileLayout>;
}
