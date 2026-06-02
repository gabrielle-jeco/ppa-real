import { useEffect, useState } from 'react';
import { BarChart2, ChevronDown } from 'lucide-react';

export default function SupervisorPerformance() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    useEffect(() => {
        fetchStats();
    }, [selectedDate]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const month = selectedDate.getMonth() + 1;
            const year = selectedDate.getFullYear();
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/supervisor/stats?month=${month}&year=${year}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (res.ok) {
                setStats(await res.json());
            }
        } catch (error) {
            console.error('Failed to fetch stats', error);
        } finally {
            setLoading(false);
        }
    };

    const getAvailableMonths = (year: number) => {
        if (year === currentYear) {
            return Array.from({ length: currentMonth + 1 }, (_, i) => i);
        }
        return Array.from({ length: 12 }, (_, i) => i);
    };

    const isFutureDate = (date: Date) => {
        const d = new Date(date);
        const t = new Date(today);
        d.setHours(0, 0, 0, 0);
        t.setHours(0, 0, 0, 0);
        return d > t;
    };

    const getDaysInMonth = () => new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
    const getFirstDayOfMonth = () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay();

    const getAttendanceColor = (day: number) => {
        const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
        if (isFutureDate(date)) return 'text-gray-300 bg-transparent';

        const hash = (day + selectedDate.getMonth() * 31) % 7;
        if (hash <= 3) return 'bg-green-500 text-white shadow-sm';
        if (hash === 4) return 'bg-yellow-400 text-white shadow-sm';
        if (hash === 5) return 'bg-red-500 text-white shadow-sm';
        return 'bg-gray-300 text-white';
    };

    const renderCalendar = () => {
        const days = [];
        const daysInMonth = getDaysInMonth();
        const firstDay = getFirstDayOfMonth();

        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-8"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = day === today.getDate()
                && selectedDate.getMonth() === today.getMonth()
                && selectedDate.getFullYear() === today.getFullYear();

            days.push(
                <div
                    key={day}
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${getAttendanceColor(day)} ${isToday ? 'ring-2 ring-primary ring-offset-2 z-10' : ''}`}
                >
                    {day}
                </div>
            );
        }

        return days;
    };

    if (loading) {
        return <div className="p-10 text-gray-400">Loading...</div>;
    }

    return (
        <div className="flex-1 h-full overflow-y-auto p-8 bg-gray-50 flex flex-col">
            <div className="flex justify-between items-center mb-8 flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">My Workspace</h1>
                    <p className="text-sm text-gray-400 mt-1">Performance and KPI monitoring</p>
                </div>

                <div className="bg-primary text-white px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm">
                    <BarChart2 size={16} />
                    <span className="text-sm font-bold">Performance</span>
                </div>
            </div>

            {stats && (
                <div className="animate-fade-in">
                    <div className="flex gap-2 mb-6 justify-start">
                        <div className="relative group w-40">
                            <select
                                value={selectedDate.getMonth()}
                                onChange={(event) => {
                                    const newDate = new Date(selectedDate);
                                    newDate.setMonth(parseInt(event.target.value));
                                    setSelectedDate(newDate);
                                }}
                                className="w-full appearance-none bg-white border border-gray-200 hover:border-purple-300 rounded-xl px-4 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors shadow-sm"
                            >
                                {getAvailableMonths(selectedDate.getFullYear()).map((month) => (
                                    <option key={month} value={month}>
                                        {new Date(0, month).toLocaleString('en-US', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                        </div>
                        <div className="relative group w-28">
                            <select
                                value={selectedDate.getFullYear()}
                                onChange={(event) => {
                                    const newDate = new Date(selectedDate);
                                    const year = parseInt(event.target.value);
                                    newDate.setFullYear(year);
                                    if (year === currentYear && newDate.getMonth() > currentMonth) {
                                        newDate.setMonth(currentMonth);
                                    }
                                    setSelectedDate(newDate);
                                }}
                                className="w-full appearance-none bg-white border border-gray-200 hover:border-purple-300 rounded-xl px-4 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors shadow-sm"
                            >
                                {Array.from({ length: currentYear - 2024 + 1 }, (_, i) => 2024 + i).map((year) => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 mb-8">
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex-1 lg:max-w-[400px]">
                            <h3 className="text-sm font-semibold text-gray-600 mb-4">Attendance History</h3>
                            <div className="grid grid-cols-7 text-center mb-2 border-b border-gray-100 pb-2">
                                {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((day) => (
                                    <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-y-3 justify-items-center">
                                {renderCalendar()}
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col gap-6">
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex-shrink-0">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-sm font-semibold text-gray-600">My AVG Point</h3>
                                    <span className="text-sm font-bold text-gray-800">{stats.my_avg_point}%</span>
                                </div>
                                <div className="w-full bg-purple-100 rounded-full h-4 overflow-hidden">
                                    <div className="bg-yellow-400 h-4 rounded-full transition-all duration-500" style={{ width: `${stats.my_avg_point}%` }}></div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 h-full">
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">{stats.task_for_sc.label || 'Task for SC'}</h3>
                                    <div className="w-full bg-purple-100 rounded-full h-3 overflow-hidden mb-2">
                                        <div className="bg-red-500 h-3 rounded-full transition-all duration-500" style={{ width: `${(stats.task_for_sc.completed / stats.task_for_sc.total) * 100}%` }}></div>
                                    </div>
                                    <p className="text-xs text-gray-400">{stats.task_for_sc.completed}% Completed</p>
                                </div>

                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">{stats.task_from_manager.label || 'Manager Review'}</h3>
                                    <div className="w-full bg-purple-100 rounded-full h-3 overflow-hidden mb-2">
                                        <div className="bg-red-500 h-3 rounded-full transition-all duration-500" style={{ width: `${(stats.task_from_manager.completed / stats.task_from_manager.total) * 100}%` }}></div>
                                    </div>
                                    <p className="text-xs text-gray-400">{stats.task_from_manager.completed}%</p>
                                </div>

                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">Task Given (Monthly)</h3>
                                    <div className="bg-gray-200 rounded-xl p-4 text-center">
                                        <span className="font-bold text-gray-700">{stats.monthly_task_given}</span>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-600 mb-4">AVG Service Crew Point</h3>
                                    <div className="bg-gray-200 rounded-xl p-4 text-center">
                                        <span className="font-bold text-gray-700">{stats.avg_service_crew_point}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
