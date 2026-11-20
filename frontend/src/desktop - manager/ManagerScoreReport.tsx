import { useEffect, useState } from 'react';
import ScoreReportPanel from '../desktop - admin/ScoreReportPanel';

type ReportOptions = {
    locations: Array<{ initial: string; name: string; region_code?: number; is_active?: number | boolean }>;
    regionals: Array<{ kode_regional: string; nama_regional: string; cabang?: string | null }>;
    locked_regional: string;
    locked_location: string | null;
};

export default function ManagerScoreReport() {
    const [options, setOptions] = useState<ReportOptions | null>(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            setError('');
            try {
                const response = await fetch('/api/manager/score-reports/options', {
                    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}`, Accept: 'application/json' },
                    signal: controller.signal,
                });
                const payload = await response.json();
                if (!response.ok) {
                    const message = Object.values(payload.errors || {}).flat().find(Boolean);
                    throw new Error(String(message || payload.message || 'Gagal memuat pilihan report penilaian.'));
                }
                if (!controller.signal.aborted) setOptions(payload);
            } catch (requestError) {
                if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Gagal memuat pilihan report penilaian.');
            }
        };
        void load();
        return () => controller.abort();
    }, [revision]);

    if (error) return (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-semibold text-red-600">
            <p>{error}</p>
            <button type="button" onClick={() => setRevision((value) => value + 1)} className="mt-3 rounded-xl border border-red-200 bg-white px-4 py-2 font-bold">Muat ulang</button>
        </div>
    );
    if (!options) return <div className="flex min-h-[300px] items-center justify-center text-sm font-bold text-gray-400">Memuat report penilaian...</div>;

    return <ScoreReportPanel locations={options.locations} regionals={options.regionals} apiBase="/api/manager/score-reports" lockedRegional={options.locked_regional} lockedLocation={options.locked_location} />;
}
