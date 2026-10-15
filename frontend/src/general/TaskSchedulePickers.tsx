import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';

type PickerAccent = 'purple' | 'blue';
type PickerAlign = 'start' | 'end';

interface TaskDatePickerProps {
    value: string;
    min: string;
    max: string;
    onChange: (value: string) => void;
    accent?: PickerAccent;
    align?: PickerAlign;
    disabled?: boolean;
}

interface TaskTimePickerProps {
    value: string;
    onChange: (value: string) => void;
    min?: string;
    accent?: PickerAccent;
    align?: PickerAlign;
    disabled?: boolean;
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

const formatDate = (value: string) => value
    ? parseDate(value).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Pilih tanggal';

const timeToMinutes = (value: string) => {
    const [hour = 0, minute = 0] = value.split(':').map(Number);
    return (hour * 60) + minute;
};

const pickerClasses = (accent: PickerAccent) => ({
    background: accent === 'blue' ? 'bg-blue-600' : 'bg-primary',
    border: accent === 'blue' ? 'border-blue-200' : 'border-purple-200',
    text: accent === 'blue' ? 'text-blue-600' : 'text-primary',
});

export function TaskDatePicker({ value, min, max, onChange, accent = 'purple', align = 'start', disabled = false }: TaskDatePickerProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [viewDate, setViewDate] = useState(() => parseDate(value || min));
    const colors = pickerClasses(accent);
    const minDate = parseDate(min);
    const maxDate = parseDate(max);

    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    const monthIsAvailable = (year: number, month: number) => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        return lastDay >= minDate && firstDay <= maxDate;
    };
    const availableMonths = Array.from({ length: 12 }, (_, month) => month)
        .filter((month) => monthIsAvailable(viewDate.getFullYear(), month));
    const availableYears = Array.from(
        { length: maxDate.getFullYear() - minDate.getFullYear() + 1 },
        (_, index) => minDate.getFullYear() + index,
    );
    const canMoveMonth = (offset: number) => monthIsAvailable(viewDate.getFullYear(), viewDate.getMonth() + offset);
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const firstWeekday = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();

    const openPicker = () => {
        if (disabled) return;
        const selectedDate = parseDate(value || min);
        setViewDate(selectedDate < minDate ? minDate : selectedDate > maxDate ? maxDate : selectedDate);
        setOpen((current) => !current);
    };

    const changeYear = (year: number) => {
        const months = Array.from({ length: 12 }, (_, month) => month).filter((month) => monthIsAvailable(year, month));
        const month = months.includes(viewDate.getMonth()) ? viewDate.getMonth() : months[0];
        setViewDate(new Date(year, month, 1));
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={openPicker}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl border bg-gray-50 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:text-gray-400 ${open ? colors.border : 'border-transparent'}`}
            >
                <span className={`min-w-0 flex-1 text-sm font-medium ${value ? 'text-gray-700' : 'text-gray-400'}`}>{formatDate(value)}</span>
                <CalendarDays size={18} className={colors.text} />
            </button>

            {open && (
                <div role="dialog" aria-label="Pilih tanggal" className={`absolute top-[calc(100%+0.5rem)] z-[80] w-[320px] max-w-[calc(100vw-3rem)] rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl ${align === 'end' ? 'right-0' : 'left-0'}`}>
                    <div className="mb-4 flex items-center gap-2">
                        <button type="button" disabled={!canMoveMonth(-1)} onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="rounded-xl bg-gray-50 p-2 text-gray-500 transition hover:bg-gray-100 disabled:text-gray-200"><ChevronLeft size={16} /></button>
                        <div className="relative min-w-0 flex-1">
                            <select value={viewDate.getMonth()} onChange={(event) => setViewDate(new Date(viewDate.getFullYear(), Number(event.target.value), 1))} className="w-full appearance-none rounded-xl border-0 bg-gray-50 px-3 py-2 pr-8 text-xs font-black text-gray-700 outline-none">
                                {availableMonths.map((month) => <option key={month} value={month}>{monthNames[month]}</option>)}
                            </select>
                            <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                        <div className="relative w-24">
                            <select value={viewDate.getFullYear()} onChange={(event) => changeYear(Number(event.target.value))} className="w-full appearance-none rounded-xl border-0 bg-gray-50 px-3 py-2 pr-8 text-xs font-black text-gray-700 outline-none">
                                {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                            </select>
                            <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                        <button type="button" disabled={!canMoveMonth(1)} onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="rounded-xl bg-gray-50 p-2 text-gray-500 transition hover:bg-gray-100 disabled:text-gray-200"><ChevronRight size={16} /></button>
                    </div>

                    <div className="grid grid-cols-7 text-center text-[9px] font-bold tracking-wider text-gray-400">
                        {weekdayNames.map((day) => <span key={day}>{day}</span>)}
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
                        {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
                        {Array.from({ length: daysInMonth }, (_, index) => {
                            const dateValue = toDateValue(new Date(viewDate.getFullYear(), viewDate.getMonth(), index + 1));
                            const unavailable = dateValue < min || dateValue > max;
                            const selected = dateValue === value;
                            return (
                                <button
                                    key={dateValue}
                                    type="button"
                                    disabled={unavailable}
                                    onClick={() => {
                                        onChange(dateValue);
                                        setOpen(false);
                                    }}
                                    className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold transition ${selected ? `${colors.background} text-white shadow-sm` : 'text-gray-600 hover:bg-gray-100'} disabled:cursor-not-allowed disabled:text-gray-200`}
                                >
                                    {index + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export function TaskTimePicker({ value, onChange, min = '', accent = 'purple', align = 'start', disabled = false }: TaskTimePickerProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const selectedHourRef = useRef<HTMLButtonElement>(null);
    const selectedMinuteRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [draftHour, setDraftHour] = useState(() => Number((value || min || '00:00').slice(0, 2)));
    const colors = pickerClasses(accent);
    const hours = Array.from({ length: 24 }, (_, hour) => hour);
    const minutes = Array.from({ length: 60 }, (_, minute) => minute);
    const minMinutes = min ? timeToMinutes(min) : -1;
    const selectedMinute = value ? Number(value.slice(3, 5)) : Number((min || '00:00').slice(3, 5));

    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', closeOnEscape);
        window.requestAnimationFrame(() => {
            selectedHourRef.current?.scrollIntoView({ block: 'center' });
            selectedMinuteRef.current?.scrollIntoView({ block: 'center' });
        });
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    const openPicker = () => {
        if (disabled) return;
        setDraftHour(Number((value || min || '00:00').slice(0, 2)));
        setOpen((current) => !current);
    };

    const selectHour = (hour: number) => {
        setDraftHour(hour);
        if ((hour * 60) + selectedMinute < minMinutes) {
            onChange(`${String(hour).padStart(2, '0')}:${String(minMinutes % 60).padStart(2, '0')}`);
        }
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={openPicker}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl border bg-gray-50 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:text-gray-400 ${open ? colors.border : 'border-transparent'}`}
            >
                <span className={`min-w-0 flex-1 text-sm font-medium ${value ? 'text-gray-700' : 'text-gray-400'}`}>{value ? value.replace(':', '.') : '--.--'}</span>
                <Clock3 size={17} className="text-gray-400" />
            </button>

            {open && (
                <div role="dialog" aria-label="Pilih jam" className={`absolute top-[calc(100%+0.5rem)] z-[80] w-52 rounded-2xl border border-gray-100 bg-white p-3 shadow-2xl ${align === 'end' ? 'right-0' : 'left-0'}`}>
                    <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-[9px] font-bold uppercase tracking-wider text-gray-400">
                        <span>Jam</span><span /><span>Menit</span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="max-h-48 space-y-1 overflow-y-auto overscroll-contain pr-1">
                            {hours.map((hour) => {
                                const unavailable = ((hour * 60) + 59) < minMinutes;
                                const selected = hour === draftHour;
                                return <button ref={selected ? selectedHourRef : undefined} key={hour} type="button" disabled={unavailable} onClick={() => selectHour(hour)} className={`w-full rounded-xl py-2 text-xs font-black transition ${selected ? `${colors.background} text-white` : 'text-gray-600 hover:bg-gray-50'} disabled:cursor-not-allowed disabled:text-gray-200`}>{String(hour).padStart(2, '0')}</button>;
                            })}
                        </div>
                        <span className={`text-lg font-black ${colors.text}`}>:</span>
                        <div className="max-h-48 space-y-1 overflow-y-auto overscroll-contain pl-1">
                            {minutes.map((minute) => {
                                const unavailable = ((draftHour * 60) + minute) < minMinutes;
                                const selected = Boolean(value) && draftHour === Number(value.slice(0, 2)) && minute === Number(value.slice(3, 5));
                                return <button ref={minute === selectedMinute ? selectedMinuteRef : undefined} key={minute} type="button" disabled={unavailable} onClick={() => {
                                    onChange(`${String(draftHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
                                    setOpen(false);
                                }} className={`w-full rounded-xl py-2 text-xs font-black transition ${selected ? `${colors.background} text-white` : 'text-gray-600 hover:bg-gray-50'} disabled:cursor-not-allowed disabled:text-gray-200`}>{String(minute).padStart(2, '0')}</button>;
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
