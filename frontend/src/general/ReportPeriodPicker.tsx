import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

type PickerMode = 'daily' | 'monthly';
type PickerAccent = 'purple' | 'blue';

interface ReportPeriodPickerProps {
    mode: PickerMode;
    start: string;
    end: string;
    max: string;
    onChange: (start: string, end: string) => void;
    accent?: PickerAccent;
    inline?: boolean;
}

const monthNames = Array.from({ length: 12 }, (_, month) => (
    new Date(2026, month, 1).toLocaleDateString('id-ID', { month: 'long' })
));
const weekdayNames = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];

const parseDate = (value: string) => {
    const [year, month = 1, day = 1] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const toDateValue = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
].join('-');

const toMonthValue = (date: Date) => toDateValue(date).slice(0, 7);

const formatValue = (value: string, mode: PickerMode) => parseDate(mode === 'monthly' ? `${value}-01` : value)
    .toLocaleDateString('id-ID', mode === 'monthly'
        ? { month: 'short', year: 'numeric' }
        : { day: '2-digit', month: 'short', year: 'numeric' });

export default function ReportPeriodPicker({
    mode,
    start,
    end,
    max,
    onChange,
    accent = 'purple',
    inline = false,
}: ReportPeriodPickerProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(inline);
    const [activeEndpoint, setActiveEndpoint] = useState<'start' | 'end'>('start');
    const [viewDate, setViewDate] = useState(() => parseDate(mode === 'monthly' ? `${end}-01` : end));
    const accentText = accent === 'blue' ? 'text-blue-600' : 'text-primary';
    const accentBackground = accent === 'blue' ? 'bg-blue-600' : 'bg-primary';
    const accentSoft = accent === 'blue' ? 'bg-blue-50' : 'bg-purple-50';
    const accentBorder = accent === 'blue' ? 'border-blue-200' : 'border-purple-200';

    useEffect(() => {
        if (inline || !open) return;
        const close = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [inline, open]);

    const choose = (value: string) => {
        if (activeEndpoint === 'start') {
            onChange(value, value > end ? value : end);
            setActiveEndpoint('end');
            return;
        }

        onChange(value < start ? value : start, value);
        setActiveEndpoint('start');
        if (!inline) setOpen(false);
    };

    const changeViewMonth = (offset: number) => {
        setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    };

    const changeViewYear = (offset: number) => {
        setViewDate((current) => new Date(current.getFullYear() + offset, current.getMonth(), 1));
    };

    const maxDate = parseDate(mode === 'monthly' ? `${max}-01` : max);
    const canMoveForward = mode === 'daily'
        ? new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1) <= maxDate
        : viewDate.getFullYear() < maxDate.getFullYear();
    const yearOptions = Array.from({ length: 21 }, (_, index) => viewDate.getFullYear() - 10 + index)
        .filter((year) => year <= maxDate.getFullYear());

    const calendar = (
        <div className={`${inline ? '' : 'absolute left-0 top-[calc(100%+0.5rem)] z-30 w-[340px] max-w-[calc(100vw-2rem)] shadow-xl'} rounded-2xl border border-gray-100 bg-white p-4`}>
            <div className={`mb-4 rounded-xl px-3 py-2 text-[11px] font-bold ${accentSoft} ${accentText}`}>
                {activeEndpoint === 'end' ? 'Pilih periode selesai' : 'Pilih periode mulai'}
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={activeEndpoint === 'start'} onClick={() => setActiveEndpoint('start')} className={`rounded-xl border px-3 py-2 text-left transition ${activeEndpoint === 'start' ? `${accentBorder} ${accentSoft}` : 'border-gray-100 hover:bg-gray-50'}`}>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Mulai</p>
                    <p className="mt-1 text-xs font-black text-gray-700">{formatValue(start, mode)}</p>
                </button>
                <button type="button" aria-pressed={activeEndpoint === 'end'} onClick={() => setActiveEndpoint('end')} className={`rounded-xl border px-3 py-2 text-left transition ${activeEndpoint === 'end' ? `${accentBorder} ${accentSoft}` : 'border-gray-100 hover:bg-gray-50'}`}>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Selesai</p>
                    <p className="mt-1 text-xs font-black text-gray-700">{formatValue(end, mode)}</p>
                </button>
            </div>

            {mode === 'daily' ? (
                <>
                    <div className="mb-4 flex items-center gap-2">
                        <button type="button" onClick={() => changeViewMonth(-1)} className="rounded-xl bg-gray-50 p-2 text-gray-500"><ChevronLeft size={16} /></button>
                        <div className="relative min-w-0 flex-1">
                            <select value={viewDate.getMonth()} onChange={(event) => setViewDate(new Date(viewDate.getFullYear(), Number(event.target.value), 1))} className="w-full appearance-none rounded-xl border-0 bg-gray-50 px-3 py-2 pr-8 text-xs font-black text-gray-700 outline-none">
                                {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
                            </select>
                            <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                        <div className="relative w-24">
                            <select value={viewDate.getFullYear()} onChange={(event) => setViewDate(new Date(Number(event.target.value), viewDate.getMonth(), 1))} className="w-full appearance-none rounded-xl border-0 bg-gray-50 px-3 py-2 pr-8 text-xs font-black text-gray-700 outline-none">
                                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                            </select>
                            <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                        <button type="button" disabled={!canMoveForward} onClick={() => changeViewMonth(1)} className="rounded-xl bg-gray-50 p-2 text-gray-500 disabled:text-gray-200"><ChevronRight size={16} /></button>
                    </div>
                    <div className="grid grid-cols-7 text-center text-[9px] font-bold tracking-wider text-gray-400">
                        {weekdayNames.map((day) => <span key={day}>{day}</span>)}
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
                        {Array.from({ length: new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() }, (_, index) => <span key={`blank-${index}`} />)}
                        {Array.from({ length: new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate() }, (_, index) => {
                            const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), index + 1);
                            const value = toDateValue(date);
                            const disabled = value > max;
                            const endpoint = value === start || value === end;
                            const inRange = value >= start && value <= end;
                            return <button key={value} type="button" disabled={disabled} onClick={() => choose(value)} className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold transition ${endpoint ? `${accentBackground} text-white` : inRange ? `${accentSoft} ${accentText}` : 'text-gray-600 hover:bg-gray-100'} disabled:cursor-not-allowed disabled:text-gray-200`}>{index + 1}</button>;
                        })}
                    </div>
                </>
            ) : (
                <>
                    <div className="mb-4 flex items-center justify-between">
                        <button type="button" onClick={() => changeViewYear(-1)} className="rounded-xl bg-gray-50 p-2 text-gray-500"><ChevronLeft size={16} /></button>
                        <div className="relative w-28">
                            <select value={viewDate.getFullYear()} onChange={(event) => setViewDate(new Date(Number(event.target.value), 0, 1))} className="w-full appearance-none rounded-xl border-0 bg-gray-50 px-4 py-2 pr-8 text-center text-sm font-black text-gray-700 outline-none">
                                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                            </select>
                            <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                        <button type="button" disabled={!canMoveForward} onClick={() => changeViewYear(1)} className="rounded-xl bg-gray-50 p-2 text-gray-500 disabled:text-gray-200"><ChevronRight size={16} /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {monthNames.map((month, index) => {
                            const value = toMonthValue(new Date(viewDate.getFullYear(), index, 1));
                            const disabled = value > max;
                            const endpoint = value === start || value === end;
                            const inRange = value >= start && value <= end;
                            return <button key={month} type="button" disabled={disabled} onClick={() => choose(value)} className={`rounded-xl px-2 py-3 text-xs font-black transition ${endpoint ? `${accentBackground} text-white` : inRange ? `${accentSoft} ${accentText}` : 'bg-gray-50 text-gray-600 hover:bg-gray-100'} disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-200`}>{month.slice(0, 3)}</button>;
                        })}
                    </div>
                </>
            )}
        </div>
    );

    if (inline) return <div ref={rootRef}>{calendar}</div>;

    return (
        <div ref={rootRef} className="relative h-full">
            <button type="button" onClick={() => setOpen((current) => !current)} className={`flex h-full min-h-[52px] w-full items-center gap-3 rounded-xl border bg-white px-3 py-2 text-left transition ${open ? accentBorder : 'border-gray-200'}`}>
                <CalendarDays size={17} className={accentText} />
                <span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Periode</span><span className="block truncate text-xs font-black text-gray-700">{formatValue(start, mode)} - {formatValue(end, mode)}</span></span>
                <ChevronDown size={15} className={`text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && calendar}
        </div>
    );
}
