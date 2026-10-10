import { useEffect, useState } from 'react';
import MobileLayout from './MobileLayout';
import {
    fetchTeamScoreDetail, formatPeriod, formatScore,
    type DailyDetailRow, type MonthlyDetailRow,
    type TeamScoreDetail, type TeamScoreFilter,
} from '../utils/teamScoreReport';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const formatMonth = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

export default function MobileTeamScoreDetail({ filter, memberId, onBack }: { filter: TeamScoreFilter; memberId: string; onBack: () => void }) {
    const [detail, setDetail] = useState<TeamScoreDetail | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchTeamScoreDetail(filter, memberId)
            .then(setDetail)
            .catch((reason) => setError(reason instanceof Error ? reason.message : 'Detail nilai gagal dimuat.'));
    }, [filter, memberId]);

    return (
        <MobileLayout title="Detail Nilai" onBack={onBack}>
            {!detail && !error && <State text="Memuat detail nilai..." />}
            {error && <State text={error} error />}
            {detail && <div className="space-y-4 pb-5"><section className="rounded-3xl bg-white p-5 shadow-sm"><p className="text-lg font-black text-gray-800">{detail.member.name}</p><p className="mt-1 text-xs font-semibold text-gray-400">{detail.member.id}</p><div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-xs font-bold text-blue-600">{formatPeriod(filter)}</div></section>{detail.mode === 'daily' ? <DailyRows rows={detail.rows as DailyDetailRow[]} /> : <MonthlyRows rows={detail.rows as MonthlyDetailRow[]} />}</div>}
        </MobileLayout>
    );
}

function DailyRows({ rows }: { rows: DailyDetailRow[] }) {
    return <div className="space-y-3">{rows.map((row) => <article key={row.date} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-black text-gray-800">{formatDate(row.date)}</p><span className="text-base font-black text-blue-600">{formatScore(row.score)}</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-gray-500"><span className="rounded-xl bg-gray-50 px-2 py-2">Approve<br />{row.approved_tasks}</span><span className="rounded-xl bg-gray-50 px-2 py-2">Belum<br />{row.unapproved_tasks}</span><span className="rounded-xl bg-gray-50 px-2 py-2">Absen<br />{row.attendance_status || '-'}</span></div>{!row.available && <p className="mt-3 text-[11px] font-semibold text-amber-600">{row.unavailable_reason === 'non_working_day' ? 'Hari bebas tugas, tidak masuk pembagi.' : 'Data absensi belum tersedia.'}</p>}</article>)}</div>;
}

function MonthlyRows({ rows }: { rows: MonthlyDetailRow[] }) {
    return <div className="space-y-3">{rows.map((row) => <article key={row.month} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-black text-gray-800">{formatMonth(row.month)}</p><span className="text-base font-black text-blue-600">{formatScore(row.total_score)}</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-gray-500"><span className="rounded-xl bg-gray-50 px-1 py-2">Tugas<br />{formatScore(row.task_score)}</span><span className="rounded-xl bg-gray-50 px-1 py-2">Absensi<br />{formatScore(row.attendance_score)}</span><span className="rounded-xl bg-gray-50 px-1 py-2">Evaluasi<br />{formatScore(row.evaluation_score)}</span></div>{row.missing_attendance_dates.length > 0 && <p className="mt-3 text-[11px] font-semibold text-amber-600">{row.missing_attendance_dates.length} hari belum memiliki data absensi.</p>}</article>)}</div>;
}

function State({ text, error = false }: { text: string; error?: boolean }) {
    return <div className={`rounded-3xl border px-5 py-10 text-center text-xs font-semibold ${error ? 'border-red-100 bg-red-50 text-red-600' : 'border-gray-100 bg-white text-gray-400'}`}>{text}</div>;
}

