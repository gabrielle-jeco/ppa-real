import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileBarChart2, Search } from 'lucide-react';
import ReportPeriodPicker from '../general/ReportPeriodPicker';

type ReportMode = 'daily' | 'monthly';

type LocationOption = {
    initial: string;
    name: string;
    region_code?: number;
};

type RegionalOption = {
    kode_regional: string;
    nama_regional: string;
};

type PersonSummary = {
    id: string;
    name: string;
    location_id: string;
    location_name: string;
};

type ReportGroup = {
    key: string;
    location_id: string;
    branch: string;
    leader_id: string | null;
    leader_name: string;
    subordinate_count: number;
    approved_tasks?: number;
    unapproved_tasks?: number;
    task_score?: number | null;
    attendance_score?: number | null;
    evaluation_score?: number | null;
    percentage: number | null;
};

type ReportRow = {
    date: string;
    branch: string;
    subordinate_id: string;
    subordinate_name: string;
    leader_id: string | null;
    leader_name: string;
    approved_tasks?: number;
    unapproved_tasks?: number;
    task_score?: number | null;
    attendance_score?: number | null;
    evaluation_score?: number | null;
    percentage: number | null;
};

type ReportPayload = {
    mode: ReportMode;
    period: { start: string; end: string };
    summary: {
        total_employees: number;
        store_managers: PersonSummary[];
        chief_operations: PersonSummary[];
        supervisors: number;
        non_staff: number;
    };
    groups: ReportGroup[];
    pagination: {
        current_page: number;
        last_page: number;
        total: number;
    };
};

type Props = {
    locations: LocationOption[];
    regionals: RegionalOption[];
};

type FilterOption = {
    value: string;
    label: string;
    secondaryLabel?: string;
};

const localDateValue = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
].join('-');

const monthValue = (date: Date) => localDateValue(date).slice(0, 7);

const dailyDefault = () => {
    const today = new Date();
    return { start: localDateValue(new Date(today.getFullYear(), today.getMonth(), 1)), end: localDateValue(today) };
};

const monthlyDefault = () => {
    const previousMonth = new Date();
    previousMonth.setDate(1);
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    const value = monthValue(previousMonth);
    return { start: value, end: value };
};

const formatDate = (value: string, mode: ReportMode) => new Date(`${mode === 'monthly' ? `${value}-01` : value}T00:00:00`)
    .toLocaleDateString('id-ID', mode === 'monthly'
        ? { month: 'long', year: 'numeric' }
        : { day: '2-digit', month: 'short', year: 'numeric' });

const score = (value?: number | null) => value === null || value === undefined ? '-' : `${Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;

async function requestJson(url: string) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const validationMessage = Object.values(payload.errors || {}).flat().find(Boolean);
        throw new Error(String(validationMessage || payload.message || 'Gagal memuat report penilaian.'));
    }
    return payload;
}

function PeriodFields({ mode, start, end, onChange }: {
    mode: ReportMode;
    start: string;
    end: string;
    onChange: (start: string, end: string) => void;
}) {
    const today = localDateValue(new Date());
    const previousMonth = new Date();
    previousMonth.setDate(1);
    previousMonth.setMonth(previousMonth.getMonth() - 1);

    return (
        <div className="h-[52px]">
            <ReportPeriodPicker
                mode={mode}
                start={start}
                end={end}
                max={mode === 'monthly' ? monthValue(previousMonth) : today}
                onChange={onChange}
            />
        </div>
    );
}

function SearchableFilter({ value, placeholder, searchPlaceholder, options, onChange }: {
    value: string;
    placeholder: string;
    searchPlaceholder: string;
    options: FilterOption[];
    onChange: (value: string) => void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const selected = options.find((option) => option.value === value);
    const normalizedSearch = search.trim().toLowerCase();
    const filteredOptions = options.filter((option) => `${option.label} ${option.secondaryLabel || ''}`.toLowerCase().includes(normalizedSearch));

    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [open]);

    const select = (nextValue: string) => {
        onChange(nextValue);
        setOpen(false);
        setSearch('');
    };

    return (
        <div ref={rootRef} className="relative">
            <button type="button" onClick={() => { setOpen((current) => !current); setSearch(''); }} className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 text-left transition hover:border-purple-200">
                <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${selected ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>{selected?.label || placeholder}</span>
                    {selected?.secondaryLabel && <span className="block truncate text-[10px] font-semibold text-gray-400">{selected.secondaryLabel}</span>}
                </span>
                <ChevronDown size={15} className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                    <label className="relative block border-b border-gray-100 p-2">
                        <Search size={15} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
                    </label>
                    <div className="max-h-64 overflow-y-auto p-1">
                        <button type="button" onClick={() => select('')} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${!value ? 'bg-purple-50 font-bold text-primary' : 'text-gray-700 hover:bg-gray-50'}`}>{placeholder}</button>
                        {filteredOptions.length === 0 ? (
                            <p className="px-3 py-5 text-center text-xs text-gray-400">Tidak ada pilihan yang cocok.</p>
                        ) : filteredOptions.map((option) => (
                            <button key={option.value} type="button" onClick={() => select(option.value)} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${option.value === value ? 'bg-purple-50 font-bold text-primary' : 'text-gray-700 hover:bg-gray-50'}`}>
                                <span className="block truncate">{option.label}</span>
                                {option.secondaryLabel && <span className="block truncate text-[10px] font-semibold text-gray-400">{option.secondaryLabel}</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function PeopleCard({ label, people }: { label: string; people: PersonSummary[] }) {
    if (people.length === 0) {
        return <SummaryCard label={label} value="-" />;
    }

    const value = people.length === 1 ? people[0].name : `${people[0].name} +${people.length - 1}`;
    return (
        <details className="group relative rounded-2xl border border-gray-100 bg-white shadow-sm">
            <summary className="flex h-full min-h-[96px] cursor-pointer list-none flex-col items-center justify-center rounded-2xl px-4 py-3 text-center transition hover:bg-purple-50/40">
                <span className="text-sm font-bold text-gray-500">{label}</span>
                <span className="mt-2 line-clamp-2 text-xl font-black leading-tight text-gray-900">{value}</span>
            </summary>
            <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 max-h-64 w-80 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-2 shadow-xl">
                {people.map((person) => (
                    <div key={`${person.location_id}-${person.id}`} className="rounded-xl px-3 py-2 hover:bg-gray-50">
                        <p className="text-sm font-black text-gray-800">{person.id} - {person.name}</p>
                        <p className="mt-1 text-[11px] font-semibold text-gray-400">{person.location_id} - {person.location_name}</p>
                    </div>
                ))}
            </div>
        </details>
    );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex min-h-[96px] flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white px-4 py-3 text-center shadow-sm">
            <p className="text-sm font-bold text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{value}</p>
        </div>
    );
}

export default function ScoreReportPanel({ locations, regionals }: Props) {
    const [mode, setMode] = useState<ReportMode>('daily');
    const [dailyPeriod, setDailyPeriod] = useState(dailyDefault);
    const [monthlyPeriod, setMonthlyPeriod] = useState(monthlyDefault);
    const [regional, setRegional] = useState('');
    const [location, setLocation] = useState('');
    const [report, setReport] = useState<ReportPayload | null>(null);
    const [appliedQuery, setAppliedQuery] = useState('');
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [detailRows, setDetailRows] = useState<Record<string, ReportRow[]>>({});
    const [loading, setLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState('');
    const reportRequestRef = useRef(0);
    const detailRequestRef = useRef(0);
    const period = mode === 'daily' ? dailyPeriod : monthlyPeriod;
    const filteredLocations = locations.filter((item) => !regional || String(item.region_code || '') === regional);
    const regionalOptions = regionals.map((item) => ({ value: item.kode_regional, label: item.nama_regional, secondaryLabel: item.kode_regional }));
    const locationOptions = filteredLocations.map((item) => ({ value: item.initial, label: `${item.initial} - ${item.name}` }));

    const queryFor = (page = 1) => {
        const query = new URLSearchParams({ start: period.start, end: period.end, page: String(page) });
        if (regional) query.set('regional', regional);
        if (location) query.set('location', location);
        return query;
    };

    const loadReport = async (page = 1) => {
        const requestId = ++reportRequestRef.current;
        detailRequestRef.current += 1;
        const requestMode = mode;
        setLoading(true);
        setError('');
        setExpandedKey(null);
        setDetailRows({});
        try {
            const query = queryFor(page);
            const payload = await requestJson(`/api/cms/score-reports/${requestMode}?${query.toString()}`);
            if (requestId !== reportRequestRef.current) return;
            setReport(payload);
            query.delete('page');
            setAppliedQuery(query.toString());
        } catch (requestError) {
            if (requestId !== reportRequestRef.current) return;
            setReport(null);
            setError(requestError instanceof Error ? requestError.message : 'Gagal memuat report penilaian.');
        } finally {
            if (requestId === reportRequestRef.current) setLoading(false);
        }
    };

    const changeMode = (nextMode: ReportMode) => {
        reportRequestRef.current += 1;
        detailRequestRef.current += 1;
        setLoading(false);
        setDetailLoading(null);
        setMode(nextMode);
        setReport(null);
        setExpandedKey(null);
        setDetailRows({});
        setError('');
    };

    const toggleGroup = async (group: ReportGroup) => {
        if (expandedKey === group.key) {
            detailRequestRef.current += 1;
            setDetailLoading(null);
            setExpandedKey(null);
            return;
        }
        const requestId = ++detailRequestRef.current;
        const requestMode = mode;
        setExpandedKey(group.key);
        if (detailRows[group.key]) return;

        setDetailLoading(group.key);
        setError('');
        try {
            const query = new URLSearchParams(appliedQuery);
            query.set('location_id', group.location_id);
            if (group.leader_id) query.set('leader_id', group.leader_id);
            const payload = await requestJson(`/api/cms/score-reports/${requestMode}/details?${query.toString()}`);
            if (requestId !== detailRequestRef.current) return;
            setDetailRows((current) => ({ ...current, [group.key]: payload.rows || [] }));
        } catch (requestError) {
            if (requestId !== detailRequestRef.current) return;
            setExpandedKey(null);
            setError(requestError instanceof Error ? requestError.message : 'Gagal memuat detail bawahan.');
        } finally {
            if (requestId === detailRequestRef.current) setDetailLoading(null);
        }
    };

    const download = async () => {
        if (!report) return;
        setDownloading(true);
        setError('');
        try {
            const response = await fetch(`/api/cms/score-reports/${mode}/export?${appliedQuery}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Gagal mengunduh report penilaian.');
            }
            const blob = await response.blob();
            const href = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = href;
            anchor.download = `report-penilaian-${mode}-${report.period.start}-${report.period.end}.xlsx`;
            anchor.click();
            URL.revokeObjectURL(href);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Gagal mengunduh report penilaian.');
        } finally {
            setDownloading(false);
        }
    };

    const periodLabel = report
        ? report.period.start === report.period.end
            ? formatDate(report.period.start, mode)
            : `${formatDate(report.period.start, mode)} - ${formatDate(report.period.end, mode)}`
        : '';
    const summary = report?.summary;

    return (
        <div className="flex h-[calc(100dvh-2rem)] min-h-[720px] flex-col overflow-hidden">
            <header className="mb-6">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-400">YoDaily CMS</p>
                <h1 className="mt-2 text-3xl font-extrabold text-gray-900">REPORT PENILAIAN</h1>
                <p className="mt-2 text-gray-500">Persentase penilaian dan penggunaan aplikasi</p>
            </header>

            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="grid grid-cols-[1fr_1fr_2fr_auto] items-end gap-4">
                    <div className="space-y-2">
                        <span className="text-xs font-black text-gray-600">Regional</span>
                        <SearchableFilter value={regional} placeholder="Semua Regional" searchPlaceholder="Cari regional..." options={regionalOptions} onChange={(value) => { setRegional(value); setLocation(''); }} />
                    </div>
                    <div className="space-y-2">
                        <span className="text-xs font-black text-gray-600">Cabang</span>
                        <SearchableFilter value={location} placeholder="Semua Cabang" searchPlaceholder="Cari cabang..." options={locationOptions} onChange={setLocation} />
                    </div>
                    <PeriodFields
                        mode={mode}
                        start={period.start}
                        end={period.end}
                        onChange={(start, end) => mode === 'daily' ? setDailyPeriod({ start, end }) : setMonthlyPeriod({ start, end })}
                    />
                    <button type="button" onClick={() => loadReport(1)} disabled={loading} className="min-h-[52px] rounded-xl bg-primary px-6 text-sm font-black text-white shadow-lg shadow-purple-200 transition hover:bg-purple-700 disabled:cursor-wait disabled:opacity-60">
                        {loading ? 'Memuat...' : 'Tampilkan Data'}
                    </button>
                </div>

                <div className="mt-5 grid grid-cols-5 gap-4">
                    <SummaryCard label="Total Karyawan" value={summary?.total_employees ?? '-'} />
                    <PeopleCard label="Store Manager" people={summary?.store_managers || []} />
                    <PeopleCard label="Chief Operation" people={summary?.chief_operations || []} />
                    <SummaryCard label="Supervisor" value={summary?.supervisors ?? '-'} />
                    <SummaryCard label="Non Staff" value={summary?.non_staff ?? '-'} />
                </div>
            </section>

            {error && <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>}

            <section className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                <div className="flex items-end gap-2 border-b border-gray-100 px-5 pt-4">
                    {(['daily', 'monthly'] as ReportMode[]).map((item) => (
                        <button key={item} type="button" onClick={() => changeMode(item)} className={`rounded-t-xl px-5 py-3 text-sm font-black transition ${mode === item ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            Penilaian {item === 'daily' ? 'Harian' : 'Bulanan'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <h2 className="font-black text-gray-800">Penilaian {mode === 'daily' ? 'Harian' : 'Bulanan'}{periodLabel ? ` - ${periodLabel}` : ''}</h2>
                    <button type="button" onClick={download} disabled={!report || downloading} className="flex items-center gap-2 rounded-xl border border-primary px-4 py-2 text-xs font-black text-primary transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300">
                        <Download size={15} /> {downloading ? 'Mengunduh...' : 'Download XLS'}
                    </button>
                </div>

                <div className="min-h-[260px] flex-1 overflow-auto px-5 pb-4">
                    <table className="w-full min-w-[1050px] border-separate border-spacing-0 text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-purple-50 text-gray-600">
                            <tr>
                                <th className="rounded-l-xl px-4 py-3 font-black">Tanggal</th>
                                <th className="px-4 py-3 font-black">Cabang</th>
                                <th className="px-4 py-3 font-black">NIK & Nama Subordinate</th>
                                <th className="px-4 py-3 font-black">NIK & Nama Atasan</th>
                                {mode === 'daily' ? (
                                    <>
                                        <th className="px-4 py-3 text-center font-black">Total Tugas Approve</th>
                                        <th className="px-4 py-3 text-center font-black">Total Tugas Not Approve</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-4 py-3 text-center font-black">Nilai Tugas</th>
                                        <th className="px-4 py-3 text-center font-black">Nilai Absensi</th>
                                        <th className="px-4 py-3 text-center font-black">Nilai Evaluasi</th>
                                    </>
                                )}
                                <th className="rounded-r-xl px-4 py-3 text-center font-black">Persentase</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!report && !loading && (
                                <tr><td colSpan={mode === 'daily' ? 7 : 8} className="py-20 text-center text-sm font-semibold text-gray-400"><FileBarChart2 className="mx-auto mb-3" size={28} />Pilih filter, lalu tampilkan data.</td></tr>
                            )}
                            {loading && (
                                <tr><td colSpan={mode === 'daily' ? 7 : 8} className="py-20 text-center text-sm font-semibold text-gray-400">Memuat report penilaian...</td></tr>
                            )}
                            {report && report.groups.length === 0 && (
                                <tr><td colSpan={mode === 'daily' ? 7 : 8} className="py-20 text-center text-sm font-semibold text-gray-400">Tidak ada data penilaian pada periode ini.</td></tr>
                            )}
                            {report?.groups.map((group) => {
                                const expanded = expandedKey === group.key;
                                const rows = detailRows[group.key] || [];
                                return [
                                    <tr key={group.key} onClick={() => toggleGroup(group)} className="cursor-pointer border-b border-gray-100 bg-white font-bold text-gray-700 transition hover:bg-purple-50/50">
                                        <td className="border-b border-gray-100 px-4 py-4">{periodLabel}</td>
                                        <td className="border-b border-gray-100 px-4 py-4">{group.location_id} - {group.branch}</td>
                                        <td className="border-b border-gray-100 px-4 py-4"><span className="flex items-center gap-2"><ChevronRight size={15} className={`text-primary transition ${expanded ? 'rotate-90' : ''}`} />{group.subordinate_count} bawahan</span></td>
                                        <td className="border-b border-gray-100 px-4 py-4">{group.leader_id ? `${group.leader_id} - ${group.leader_name}` : group.leader_name}</td>
                                        {mode === 'daily' ? (
                                            <><td className="border-b border-gray-100 px-4 py-4 text-center">{group.approved_tasks}</td><td className="border-b border-gray-100 px-4 py-4 text-center">{group.unapproved_tasks}</td></>
                                        ) : (
                                            <><td className="border-b border-gray-100 px-4 py-4 text-center">{score(group.task_score)}</td><td className="border-b border-gray-100 px-4 py-4 text-center">{score(group.attendance_score)}</td><td className="border-b border-gray-100 px-4 py-4 text-center">{score(group.evaluation_score)}</td></>
                                        )}
                                        <td className="border-b border-gray-100 px-4 py-4 text-center text-primary">{score(group.percentage)}</td>
                                    </tr>,
                                    ...(expanded ? [
                                        detailLoading === group.key
                                            ? <tr key={`${group.key}-loading`}><td colSpan={mode === 'daily' ? 7 : 8} className="bg-gray-50 py-6 text-center text-gray-400">Memuat daftar bawahan...</td></tr>
                                            : rows.length === 0
                                                ? <tr key={`${group.key}-empty`}><td colSpan={mode === 'daily' ? 7 : 8} className="bg-gray-50 py-6 text-center text-gray-400">Tidak ada detail bawahan.</td></tr>
                                                : rows.map((row, index) => (
                                                    <tr key={`${group.key}-${row.subordinate_id}-${row.date}-${index}`} className="bg-gray-50/70 text-gray-600">
                                                        <td className="border-b border-white px-4 py-3 pl-8">{formatDate(row.date, mode)}</td>
                                                        <td className="border-b border-white px-4 py-3">{row.branch}</td>
                                                        <td className="border-b border-white px-4 py-3 font-bold text-gray-700">{row.subordinate_id} - {row.subordinate_name}</td>
                                                        <td className="border-b border-white px-4 py-3">{row.leader_id ? `${row.leader_id} - ${row.leader_name}` : row.leader_name}</td>
                                                        {mode === 'daily' ? (
                                                            <><td className="border-b border-white px-4 py-3 text-center">{row.approved_tasks}</td><td className="border-b border-white px-4 py-3 text-center">{row.unapproved_tasks}</td></>
                                                        ) : (
                                                            <><td className="border-b border-white px-4 py-3 text-center">{score(row.task_score)}</td><td className="border-b border-white px-4 py-3 text-center">{score(row.attendance_score)}</td><td className="border-b border-white px-4 py-3 text-center">{score(row.evaluation_score)}</td></>
                                                        )}
                                                        <td className="border-b border-white px-4 py-3 text-center font-bold text-primary">{score(row.percentage)}</td>
                                                    </tr>
                                                )),
                                    ] : []),
                                ];
                            })}
                        </tbody>
                    </table>
                </div>

                {report && report.pagination.last_page > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-xs font-bold text-gray-400">
                        <span>Halaman {report.pagination.current_page} dari {report.pagination.last_page}</span>
                        <div className="flex gap-2">
                            <button type="button" disabled={report.pagination.current_page <= 1 || loading} onClick={() => loadReport(report.pagination.current_page - 1)} className="rounded-lg border border-gray-200 p-2 text-gray-500 disabled:text-gray-200"><ChevronLeft size={15} /></button>
                            <button type="button" disabled={report.pagination.current_page >= report.pagination.last_page || loading} onClick={() => loadReport(report.pagination.current_page + 1)} className="rounded-lg border border-gray-200 p-2 text-gray-500 disabled:text-gray-200"><ChevronRight size={15} /></button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
