import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { clampToTaskWindow, getAvailableTaskMonths, getAvailableTaskYears, isAfterTaskWindow } from '../utils/taskDateWindow';

interface Props {
    selectedDate: Date;
    onChange: (date: Date) => void;
    renderDay?: (date: Date) => ReactNode;
}

export default function DesktopTaskCalendar({ selectedDate, onChange, renderDay }: Props) {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const offset = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    return (
        <div className="bg-white rounded-2xl p-4 mt-6 border border-gray-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full -z-0 opacity-50" />
            <div className="flex justify-between items-center mb-6 text-sm font-semibold text-gray-700 relative z-10">
                <div className="grid grid-cols-[minmax(0,1fr)_64px] gap-1 w-full">
                    <div className="relative group min-w-0">
                        <select aria-label="Bulan penugasan" value={month} onChange={event => {
                            const next = new Date(selectedDate); next.setMonth(Number(event.target.value)); onChange(clampToTaskWindow(next));
                        }} className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl pl-2 pr-5 py-2 font-bold text-gray-700 text-xs cursor-pointer outline-none transition-colors">
                            {getAvailableTaskMonths(year).map(value => <option key={value} value={value}>{new Date(0, value).toLocaleString('id-ID', { month: 'long' })}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="relative group min-w-0">
                        <select aria-label="Tahun penugasan" value={year} onChange={event => {
                            const next = new Date(selectedDate); next.setFullYear(Number(event.target.value)); onChange(clampToTaskWindow(next));
                        }} className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl pl-2 pr-5 py-2 text-gray-700 font-bold text-xs cursor-pointer outline-none transition-colors">
                            {getAvailableTaskYears().map(value => <option key={value} value={value}>{value}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-primary transition-colors" />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 font-medium uppercase tracking-wider gap-y-4 mb-2 relative z-10">
                {['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'].map(day => <span key={day}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-700 gap-y-3 relative z-10">
                {Array.from({ length: offset }, (_, index) => <div key={`empty-${index}`} />)}
                {Array.from({ length: days }, (_, index) => {
                    const day = new Date(year, month, index + 1);
                    if (renderDay) return <div key={index}>{renderDay(day)}</div>;
                    const selected = day.getDate() === selectedDate.getDate();
                    const unavailable = isAfterTaskWindow(day);
                    return <div key={index} className="flex justify-center"><button type="button" aria-label={day.toLocaleDateString('id-ID')} aria-pressed={selected} onClick={() => onChange(day)} disabled={unavailable}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] transition ${selected ? 'bg-primary text-white shadow-md transform scale-110' : unavailable ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-purple-100 text-gray-700'}`}>
                        {index + 1}
                    </button></div>;
                })}
            </div>
        </div>
    );
}
