import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import MobileLayout from './MobileLayout';
import {
    fetchTeamScoreSummary, formatPeriod, formatScore,
    type DailyMemberScore, type MonthlyMemberScore,
    type TeamScoreFilter, type TeamScoreMember, type TeamScoreSummary,
} from '../utils/teamScoreReport';

export default function MobileTeamScoreResults({ filter, onBack, onSelect }: {
    filter: TeamScoreFilter;
    onBack: () => void;
    onSelect: (member: TeamScoreMember) => void;
}) {
    const [report, setReport] = useState<TeamScoreSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchTeamScoreSummary(filter)
            .then((payload) => {
                setError(null);
                setReport(payload);
            })
            .catch((reason) => setError(reason instanceof Error ? reason.message : 'Laporan gagal dimuat.'));
    }, [filter]);

    return (
        <MobileLayout title={`Nilai ${filter.mode === 'daily' ? 'Harian' : 'Bulanan'}`} onBack={onBack}>
            <div className="pb-5">
                <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">Periode</p><p className="mt-1 text-xs font-bold text-gray-700">{formatPeriod(filter)}</p></div>
                {!report && !error && <StateCard text="Menghitung nilai tim..." />}
                {error && <StateCard text={error} error />}
                {report?.members.length === 0 && <StateCard text="Belum ada bawahan permanen aktif." />}
                <div className="space-y-3">{report?.members.map((member, index) => <MemberCard key={member.id} member={member} index={index} mode={filter.mode} onClick={() => onSelect(member)} />)}</div>
            </div>
        </MobileLayout>
    );
}

function MemberCard({ member, index, mode, onClick }: { member: TeamScoreMember; index: number; mode: TeamScoreFilter['mode']; onClick: () => void }) {
    const daily = mode === 'daily' ? member as DailyMemberScore : null;
    const monthly = mode === 'monthly' ? member as MonthlyMemberScore : null;
    return <button type="button" onClick={onClick} className="w-full rounded-3xl border border-gray-100 bg-white p-5 text-left shadow-sm transition active:scale-[0.99]"><div className="flex items-center gap-3"><div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-sm font-black text-blue-600">{index + 1}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-gray-800">{member.name}</p><p className="mt-1 text-[11px] font-semibold text-gray-400">{member.id}</p></div><span className="text-base font-black text-blue-600">{formatScore(daily?.score ?? monthly?.total_score)}</span><ChevronRight size={18} className="text-gray-300" /></div>{daily ? <div className="mt-4 grid grid-cols-2 gap-2 text-center"><span className="rounded-xl bg-gray-50 px-2 py-2"><small className="block text-[9px] font-bold leading-tight text-gray-400">Total Tugas Approve</small><strong className="mt-1 block text-xs text-gray-700">{daily.approved_tasks}</strong></span><span className="rounded-xl bg-gray-50 px-2 py-2"><small className="block text-[9px] font-bold leading-tight text-gray-400">Total Tugas Not Approve</small><strong className="mt-1 block text-xs text-gray-700">{daily.unapproved_tasks}</strong></span></div> : monthly && <div className="mt-4 grid grid-cols-3 gap-2 text-center"><span className="rounded-xl bg-gray-50 px-1 py-2"><small className="block text-[9px] font-bold leading-tight text-gray-400">Nilai Tugas</small><strong className="mt-1 block text-[11px] text-gray-700">{formatScore(monthly.task_score)}</strong></span><span className="rounded-xl bg-gray-50 px-1 py-2"><small className="block text-[9px] font-bold leading-tight text-gray-400">Nilai Absensi</small><strong className="mt-1 block text-[11px] text-gray-700">{formatScore(monthly.attendance_score)}</strong></span><span className="rounded-xl bg-gray-50 px-1 py-2"><small className="block text-[9px] font-bold leading-tight text-gray-400">Nilai Evaluasi</small><strong className="mt-1 block text-[11px] text-gray-700">{formatScore(monthly.evaluation_score)}</strong></span></div>}</button>;
}

function StateCard({ text, error = false }: { text: string; error?: boolean }) {
    return <div className={`rounded-3xl border px-5 py-10 text-center text-xs font-semibold ${error ? 'border-red-100 bg-red-50 text-red-600' : 'border-gray-100 bg-white text-gray-400'}`}>{text}</div>;
}

