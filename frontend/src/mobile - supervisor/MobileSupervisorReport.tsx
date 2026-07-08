import React, { useState, useEffect } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import MobileLayout from './MobileLayout';
import { getAttendanceColor, getAttendanceDay } from '../utils/attendanceCalendar';

interface MobileSupervisorReportProps {
    onBack: () => void;
}

export default function MobileSupervisorReport({ onBack }: MobileSupervisorReportProps) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const getAvailableMonths = (year: number) => {
        if (year === currentYear) {
            return Array.from({ length: currentMonth + 1 }, (_, i) => i);
        }
        return Array.from({ length: 12 }, (_, i) => i);
    };

    const isFutureDate = (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const t = new Date(today);
        t.setHours(0, 0, 0, 0);
        return d > t;
    };

    const getDaysInMonth = () => {
        return new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
    };

    const getFirstDayOfMonth = () => {
        return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay();
    };

    const renderCalendar = () => {
        const daysInMonth = getDaysInMonth();
        const firstDay = getFirstDayOfMonth();
        const days = [];

        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8 md:h-9"></div>);

        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i);
            const isSelected = i === selectedDate.getDate();
            const isFuture = isFutureDate(date);
            const isToday = date.getDate() === today.getDate() &&
                date.getMonth() === today.getMonth() &&
                date.getFullYear() === today.getFullYear();

            const attendanceDay = getAttendanceDay(stats?.attendance_calendar, date);
            const attendanceColor = getAttendanceColor(attendanceDay?.status_code, isFuture);

            days.push(
                <button
                    key={i}
                    disabled={true}
                    className={`h-8 w-8 rounded-full flex flex-col items-center justify-center text-xs font-bold transition relative ${attendanceColor} ${isToday ? 'ring-2 ring-purple-500 ring-offset-2 z-10' : ''}`}
                >
                    {i}
                </button>
            );
        }
        return days;
    };

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                const month = selectedDate.getMonth() + 1;
                const year = selectedDate.getFullYear();
                const response = await fetch(`/api/supervisor/stats?month=${month}&year=${year}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setStats(data);
                }
            } catch (error) {
                console.error("Gagal mengambil statistik laporan supervisor", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [selectedDate]);

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(parseInt(e.target.value));
        setSelectedDate(newDate);
    };

    const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDate = new Date(selectedDate);
        newDate.setFullYear(parseInt(e.target.value));
        setSelectedDate(newDate);
    };

    return (
        <MobileLayout
            title="Laporan Performa"
            onBack={onBack}
        >
            <div className="flex flex-col gap-4 pb-6">

                <div className="bg-white rounded-3xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 w-full">
                        <div className="relative group flex-1">
                            <select
                                value={selectedDate.getMonth()}
                                onChange={handleMonthChange}
                                className="w-full appearance-none bg-gray-50 border border-transparent hover:border-blue-100 rounded-xl px-3 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors"
                            >
                                {getAvailableMonths(selectedDate.getFullYear()).map(i => (
                                    <option key={i} value={i}>
                                        {new Date(0, i).toLocaleString('id-ID', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-blue-600 transition-colors" />
                        </div>

                        <div className="relative group w-24">
                            <select
                                value={selectedDate.getFullYear()}
                                onChange={handleYearChange}
                                className="w-full appearance-none bg-gray-50 border border-transparent hover:border-blue-100 rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                            >
                                {Array.from({ length: new Date().getFullYear() - 2024 + 1 }, (_, i) => 2024 + i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-blue-600 transition-colors" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-800 mb-4">Riwayat Kehadiran</h3>
                    <div className="grid grid-cols-7 text-center mb-2 border-b border-gray-100 pb-2">
                        {['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'].map(day => (
                            <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1 justify-items-center">
                        {renderCalendar()}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xs font-bold text-gray-600">Rata-rata Poin Saya</h3>
                        <span className="text-sm font-bold text-gray-800">{stats?.my_avg_point || 0}%</span>
                    </div>
                    <div className="w-full bg-purple-50 rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full transition-all duration-1000" style={{ width: `${stats?.my_avg_point || 0}%` }}></div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                        <h3 className="text-xs font-bold text-gray-600 mb-3">Pekerjaan untuk SC</h3>
                        <div className="w-full bg-purple-50 rounded-full h-3 overflow-hidden mb-1">
                            <div className="h-full bg-red-500 rounded-full transition-all duration-1000" style={{ width: `${stats?.task_for_sc?.completed || 0}%` }}></div>
                        </div>
                        <p className="text-[10px] text-gray-400">{stats?.task_for_sc?.completed || 0}% Selesai</p>
                    </div>

                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                        <h3 className="text-xs font-bold text-gray-600 mb-3">{stats?.task_from_manager?.label || 'Penilaian Manager'}</h3>
                        <div className="w-full bg-purple-50 rounded-full h-3 overflow-hidden mb-1">
                            <div className="h-full bg-red-500 rounded-full transition-all duration-1000" style={{ width: `${stats?.task_from_manager?.completed || 0}%` }}></div>
                        </div>
                        <p className="text-[10px] text-gray-400">{stats?.task_from_manager?.completed || 0}%</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                        <h3 className="text-xs font-bold text-gray-600 mb-3">Pekerjaan yang Diberikan (Bulanan)</h3>
                        <div className="bg-gray-200 rounded-xl py-3 px-4 text-center">
                            <span className="font-bold text-gray-700 text-sm">{(stats?.monthly_task_given || '0/0 Orang').replace('People', 'Orang')}</span>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl shadow-sm">
                        <h3 className="text-xs font-bold text-gray-600 mb-3">Rata-rata Nilai Service Crew</h3>
                        <div className="bg-gray-200 rounded-xl py-3 px-4 text-center">
                            <span className="font-bold text-gray-700 text-sm">{stats?.avg_service_crew_point || 0}%</span>
                        </div>
                    </div>
                </div>

            </div>
        </MobileLayout>
    );
}
