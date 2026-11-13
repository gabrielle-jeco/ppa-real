import { useEffect, useRef, useState } from 'react';
import { BellRing, ChevronDown, Search } from 'lucide-react';
import DesktopCrewCard from '../general/DesktopCrewCard';
import { formatDisplayNumber } from '../general/numberFormat';

interface SupervisorListProps {
    data: any;
    selectedId: string | null;
    onSelect: (id: string) => void;
    selectedLocationId: string;
    onFilterLocation: (id: string) => void;
    crews: any[];
    selectedCrewId: string | null;
    onSelectCrew: (id: string) => void;
    pendingRequestCount: number;
    onOpenRequests: () => void;
}

function SearchableSelect({ value, options, placeholder, searchPlaceholder, onChange }: {
    value: string;
    options: Array<{ value: string; label: string; detail?: string }>;
    placeholder: string;
    searchPlaceholder: string;
    onChange: (value: string) => void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const selected = options.find((option) => option.value === value);
    const normalized = search.trim().toLocaleLowerCase('id-ID');
    const filtered = options.filter((option) => `${option.label} ${option.detail || ''}`.toLocaleLowerCase('id-ID').includes(normalized));

    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <button type="button" onClick={() => { setOpen((current) => !current); setSearch(''); }} className="flex min-h-[50px] w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 text-left shadow-sm transition hover:border-purple-200">
                <span className="min-w-0">
                    <span className={`block truncate text-sm ${selected ? 'font-bold text-gray-700' : 'text-gray-400'}`}>{selected?.label || placeholder}</span>
                    {selected?.detail && <span className="block truncate text-[10px] text-gray-400">{selected.detail}</span>}
                </span>
                <ChevronDown size={16} className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                    <label className="relative block border-b border-gray-100 p-2">
                        <Search size={15} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
                    </label>
                    <div className="max-h-60 overflow-y-auto p-1">
                        {filtered.length === 0 && <p className="px-3 py-5 text-center text-xs text-gray-400">Pilihan tidak ditemukan.</p>}
                        {filtered.map((option) => (
                            <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); setSearch(''); }} className={`w-full rounded-lg px-3 py-2.5 text-left ${option.value === value ? 'bg-purple-50 text-primary' : 'text-gray-700 hover:bg-gray-50'}`}>
                                <span className="block truncate text-sm font-bold">{option.label}</span>
                                {option.detail && <span className="block truncate text-[10px] text-gray-400">{option.detail}</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SupervisorList({ data, selectedId, onSelect, selectedLocationId, onFilterLocation, crews, selectedCrewId, onSelectCrew, pendingRequestCount, onOpenRequests }: SupervisorListProps) {
    const { manager, location_name, supervisors, locations } = data;
    const [crewSearch, setCrewSearch] = useState('');
    const normalizedSearch = crewSearch.trim().toLocaleLowerCase('id-ID');
    const filteredCrews = crews.filter((crew) => `${crew.id} ${crew.name}`.toLocaleLowerCase('id-ID').includes(normalizedSearch));
    const completion = crews.length > 0
        ? crews.reduce((total, crew) => total + (crew.tasks_total ? crew.tasks_approved / crew.tasks_total : 0), 0) / crews.length * 100
        : 0;

    const supervisorOptions = (supervisors || []).map((supervisor: any) => ({ value: supervisor.id, label: `${supervisor.id} - ${supervisor.name}`, detail: supervisor.location }));
    const locationOptions = [{ value: '', label: 'Semua Lokasi' }, ...(locations || []).map((location: any) => ({ value: location.id, label: location.name }))];

    return (
        <div className="z-10 flex h-full w-full flex-shrink-0 flex-col border-r border-gray-200 bg-white transition-all duration-300 md:w-64 lg:w-64 xl:w-64 2xl:w-96">
            <div className="p-8 pb-4">
                <div className="mb-5 flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Karyawan</h1>
                        <p className="mt-3 text-xs text-gray-500">Selamat datang, {manager?.role || 'Manager'}</p>
                        <h2 className="mt-1 text-lg font-bold text-gray-800">{manager?.name || 'User'}!</h2>
                    </div>
                    <button type="button" onClick={onOpenRequests} className="relative rounded-xl border border-purple-100 bg-purple-50 p-3 text-primary transition hover:bg-purple-100" title="Permintaan perpanjangan evaluasi">
                        <BellRing size={20} />
                        {pendingRequestCount > 0 && <span className="absolute -right-2 -top-2 min-w-[22px] rounded-full bg-red-500 px-1.5 py-1 text-center text-[10px] font-black text-white">{pendingRequestCount > 99 ? '99+' : pendingRequestCount}</span>}
                    </button>
                </div>

                <div className="space-y-3">
                    {manager?.type === 'RM' ? (
                        <SearchableSelect value={selectedLocationId} options={locationOptions} placeholder="Semua Lokasi" searchPlaceholder="Cari lokasi..." onChange={onFilterLocation} />
                    ) : (
                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold uppercase tracking-wide text-gray-700 shadow-sm">{location_name}</div>
                    )}
                    <SearchableSelect value={selectedId || ''} options={supervisorOptions} placeholder="Pilih supervisor" searchPlaceholder="Cari nama atau NIK supervisor..." onChange={onSelect} />
                </div>

                <div className="mt-5">
                    <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completion}%` }} /></div>
                    <p className="text-xs text-gray-500">Rata-rata Penyelesaian Tugas: <span className="font-medium text-gray-800">{formatDisplayNumber(completion, '0')}%</span></p>
                </div>

                <div className="relative mt-4 border-t border-gray-200 pt-4">
                    <input type="search" placeholder="Cari nama atau NIK crew..." value={crewSearch} onChange={(event) => setCrewSearch(event.target.value)} className="w-full rounded-xl border border-gray-200 py-3 pl-4 pr-11 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-purple-100" />
                    <Search size={18} className="pointer-events-none absolute bottom-3.5 right-4 text-gray-400" />
                </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6">
                {filteredCrews.length === 0 && <div className="py-10 text-center text-sm text-gray-400">Crew tidak ditemukan.</div>}
                {filteredCrews.map((crew: any, index: number) => (
                    <DesktopCrewCard
                        key={crew.id}
                        crew={crew}
                        index={index}
                        selected={selectedCrewId === String(crew.id)}
                        onSelect={onSelectCrew}
                    />
                ))}
            </div>
        </div>
    );
}
