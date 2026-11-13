import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Download, FileSpreadsheet, X } from 'lucide-react';
import ReportPeriodPicker from '../general/ReportPeriodPicker';

type LocationOption = {
    initial: string;
    name: string;
};

type SelectOption = {
    value: string;
    label: string;
};

type Props = {
    open: boolean;
    locations: LocationOption[];
    onClose: () => void;
};

const localDateValue = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
].join('-');

const defaultPeriod = () => {
    const today = new Date();
    return {
        start: localDateValue(new Date(today.getFullYear(), today.getMonth(), 1)),
        end: localDateValue(today),
    };
};

export default function TaskUsageExportModal({ open, locations, onClose }: Props) {
    const [location, setLocation] = useState('');
    const [period, setPeriod] = useState(defaultPeriod);
    const [sortBy, setSortBy] = useState('frequency');
    const [sortDirection, setSortDirection] = useState('desc');
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState('');
    const today = localDateValue(new Date());

    useEffect(() => {
        if (!open) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [onClose, open]);

    if (!open) return null;

    const download = async () => {
        setDownloading(true);
        setError('');
        try {
            const query = new URLSearchParams({
                start_date: period.start,
                end_date: period.end,
                sort_by: sortBy,
                sort_direction: sortDirection,
            });
            if (location) query.set('location', location);

            const response = await fetch(`/api/cms/task-usage/export?${query.toString()}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                const validationMessage = Object.values(payload.errors || {}).flat().find(Boolean);
                throw new Error(String(validationMessage || payload.message || 'Gagal mengunduh data penggunaan master task.'));
            }

            const blobUrl = URL.createObjectURL(await response.blob());
            const disposition = response.headers.get('content-disposition') || '';
            const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
                || `penggunaan-master-task-${period.start}-${period.end}.xlsx`;
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = filename;
            anchor.click();
            URL.revokeObjectURL(blobUrl);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Gagal mengunduh data penggunaan master task.');
        } finally {
            setDownloading(false);
        }
    };

    const locationOptions = locations.map((item) => ({
        value: item.initial,
        label: `${item.initial} - ${item.name}`,
    }));

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-6 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="w-full max-w-3xl rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <span className="rounded-2xl bg-purple-50 p-3 text-primary"><FileSpreadsheet size={22} /></span>
                        <div>
                            <h2 className="text-xl font-black text-gray-900">Export Penggunaan Master Task</h2>
                            <p className="mt-1 text-sm text-gray-500">Unduh frekuensi penggunaan kategori, area, dan master task per cabang.</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Tutup modal"><X size={20} /></button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Field label="Cabang">
                        <SearchableSelect value={location} placeholder="Semua Cabang" options={locationOptions} onChange={setLocation} />
                    </Field>
                    <Field label="Periode Penggunaan">
                        <div className="h-[52px]">
                            <ReportPeriodPicker mode="daily" start={period.start} end={period.end} max={today} onChange={(start, end) => setPeriod({ start, end })} />
                        </div>
                    </Field>
                    <Field label="Urutkan Berdasarkan">
                        <SearchableSelect
                            value={sortBy}
                            placeholder="Pilih urutan"
                            options={[
                                { value: 'frequency', label: 'Paling sering digunakan' },
                                { value: 'category', label: 'Kategori' },
                                { value: 'area', label: 'Area' },
                                { value: 'task', label: 'Master Task' },
                            ]}
                            onChange={setSortBy}
                            allowEmpty={false}
                        />
                    </Field>
                    <Field label="Arah Urutan">
                        <div className="grid min-h-[52px] grid-cols-2 rounded-xl bg-gray-100 p-1">
                            <button type="button" onClick={() => setSortDirection('desc')} className={`rounded-lg px-4 text-sm font-black transition ${sortDirection === 'desc' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Menurun</button>
                            <button type="button" onClick={() => setSortDirection('asc')} className={`rounded-lg px-4 text-sm font-black transition ${sortDirection === 'asc' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Menaik</button>
                        </div>
                    </Field>
                </div>

                <p className="mt-4 text-xs leading-5 text-gray-400">Rentang maksimal 366 hari. Penugasan bulk pada tanggal yang sama dihitung satu kali meskipun diberikan kepada beberapa crew.</p>
                {error && <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>}

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-600 transition hover:bg-gray-50">Batal</button>
                    <button type="button" onClick={download} disabled={downloading} className="flex min-w-48 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-white shadow-lg shadow-purple-200 transition hover:bg-purple-700 disabled:cursor-wait disabled:opacity-60">
                        <Download size={17} /> {downloading ? 'Mengunduh...' : 'Download XLSX'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="space-y-2"><span className="block text-xs font-black text-gray-600">{label}</span>{children}</label>;
}

function SearchableSelect({ value, placeholder, options, onChange, allowEmpty = true }: { value: string; placeholder: string; options: SelectOption[]; onChange: (value: string) => void; allowEmpty?: boolean }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const selected = options.find((option) => option.value === value);
    const filtered = options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()));

    useEffect(() => {
        const close = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    return (
        <div ref={rootRef} className="relative">
            <button type="button" onClick={() => { setOpen((current) => !current); setSearch(''); }} className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 text-left text-sm font-semibold text-gray-700">
                <span className="truncate">{selected?.label || placeholder}</span>
                <ChevronDown size={16} className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                    <div className="sticky top-0 border-b border-gray-100 bg-white p-2">
                        <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Cari..." />
                    </div>
                    {allowEmpty && <OptionButton active={!value} label={placeholder} onClick={() => { onChange(''); setOpen(false); }} />}
                    {filtered.map((option) => <OptionButton key={option.value} active={option.value === value} label={option.label} onClick={() => { onChange(option.value); setOpen(false); }} />)}
                    {filtered.length === 0 && <p className="px-3 py-4 text-center text-xs text-gray-400">Tidak ada pilihan yang cocok.</p>}
                </div>
            )}
        </div>
    );
}

function OptionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return <button type="button" onClick={onClick} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-purple-50 font-bold text-primary' : 'text-gray-700 hover:bg-gray-50'}`}>{label}</button>;
}
