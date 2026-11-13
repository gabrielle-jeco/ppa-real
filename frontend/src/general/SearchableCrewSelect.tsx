import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { CashierCrew } from '../utils/cashier';

interface SearchableCrewSelectProps {
    value: string;
    options: CashierCrew[];
    onChange: (value: string) => void;
    accent?: 'purple' | 'blue';
}

export default function SearchableCrewSelect({
    value,
    options,
    onChange,
    accent = 'purple',
}: SearchableCrewSelectProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const selected = options.find((crew) => crew.id === value);
    const term = search.trim().toLocaleLowerCase('id-ID');
    const filtered = options.filter((crew) => !term || `${crew.id} ${crew.name}`.toLocaleLowerCase('id-ID').includes(term));
    const focusBorder = accent === 'blue' ? 'focus:border-blue-500' : 'focus:border-primary';
    const selectedStyle = accent === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-primary';

    useEffect(() => {
        const closeOnOutsideClick = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
    }, []);

    const toggle = () => {
        setOpen((current) => {
            if (!current) setSearch('');
            return !current;
        });
    };

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={toggle}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left text-sm outline-none"
            >
                <span className={selected ? 'min-w-0 truncate font-semibold text-gray-700' : 'text-gray-400'}>
                    {selected ? `${selected.id} - ${selected.name}` : 'Pilih karyawan'}
                </span>
                <ChevronDown size={16} className={`flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                    <label className="relative block border-b border-gray-100 p-2">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                        <input
                            autoFocus
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Cari nama atau NIK..."
                            className={`w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm outline-none ${focusBorder}`}
                        />
                    </label>
                    <div className="max-h-52 overflow-y-auto p-1" role="listbox">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-5 text-center text-xs text-gray-400">Karyawan tidak ditemukan.</p>
                        ) : filtered.map((crew) => (
                            <button
                                key={crew.id}
                                type="button"
                                role="option"
                                aria-selected={crew.id === value}
                                onClick={() => {
                                    onChange(crew.id);
                                    setOpen(false);
                                }}
                                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-gray-50 ${crew.id === value ? selectedStyle : 'text-gray-700'}`}
                            >
                                <span className="block font-semibold">{crew.name}</span>
                                <span className="mt-0.5 block text-[11px] text-gray-400">{crew.id}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
