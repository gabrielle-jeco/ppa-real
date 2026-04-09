import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Trash2, ChevronDown, Check } from 'lucide-react';
import type { DummyCrew } from './dummySupervisorDashboard';

interface CrewDetailProps {
    crew: DummyCrew;
}

const createToday = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
};

const isSameDate = (left: Date, right: Date) =>
    left.getDate() === right.getDate() &&
    left.getMonth() === right.getMonth() &&
    left.getFullYear() === right.getFullYear();

export default function CrewDetail({ crew }: CrewDetailProps) {
    const [selectedDate, setSelectedDate] = useState(createToday);

    useEffect(() => {
        setSelectedDate(createToday());
    }, [crew.id]);

    const dashboardRecord = useMemo(() => crew.dailyRecords[0] ?? null, [crew]);
    const tasks = dashboardRecord?.tasks ?? [];
    const activityLogs = dashboardRecord?.activityLogs ?? [];

    const isToday = (date: Date) => {
        const today = createToday();
        return isSameDate(date, today);
    };

    const getCalendarDays = () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];
        for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
        for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
        return days;
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 p-6 overflow-hidden relative">
            <div className="items-center justify-between hidden lg:flex mb-6"></div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-full flex-1 min-h-0">
                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-3 flex flex-col gap-4 lg:gap-6 h-full overflow-y-auto pr-2 min-h-0">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-primary mb-1">{crew.name}</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            Role as <span className="underline decoration-primary">{`Crew - ${crew.current_workstation}`}</span> <br />
                            Today
                        </p>
                        <button
                            type="button"
                            className="text-xs font-bold py-2 px-6 rounded-full transition w-full shadow-md bg-primary text-white border-2 border-transparent"
                        >
                            Evaluation
                        </button>
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">Activity & Task</h3>
                            <button
                                type="button"
                                className="text-[10px] font-bold py-1 px-3 rounded-full transition border bg-purple-100 text-primary border-primary"
                            >
                                View
                            </button>
                        </div>

                        <div className="mb-0">
                            <h4 className="font-bold text-gray-800 text-sm mb-3">Task</h4>
                            <div className="relative mb-3 h-12">
                                <button
                                    type="button"
                                    className="w-full h-full border rounded-lg px-4 flex items-center justify-between text-xs font-semibold shadow-sm transition group bg-white border-gray-200 text-gray-600"
                                >
                                    <span>Choose Task</span>
                                    <span className="bg-gray-100 text-gray-500 rounded-full w-5 h-5 flex items-center justify-center text-lg leading-none pb-0.5">+</span>
                                </button>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                        style={{ width: `${tasks.length > 0 ? (tasks.filter(t => t.status === 'approved').length / tasks.length) * 100 : 0}%` }}
                                    ></div>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-400">Task Completed: {tasks.filter(t => t.status === 'approved').length}/{tasks.length}</p>
                        </div>

                        <div className="bg-white rounded-2xl p-6 mt-6 border border-gray-100 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full -z-0 opacity-50"></div>

                            <div className="flex justify-between items-center mb-6 text-sm font-semibold text-gray-700 relative z-10 px-2">
                                <div className="flex items-center gap-2 w-full">
                                    <div className="relative group flex-1">
                                        <select
                                            value={selectedDate.getMonth()}
                                            onChange={(e) => {
                                                const newDate = new Date(selectedDate);
                                                newDate.setMonth(parseInt(e.target.value));
                                                setSelectedDate(newDate);
                                            }}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl px-3 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {Array.from({ length: 12 }, (_, i) => i)
                                                .filter(m => selectedDate.getFullYear() < new Date().getFullYear() || m <= new Date().getMonth())
                                                .map(i => (
                                                    <option key={i} value={i} className="text-sm">
                                                        {new Date(0, i).toLocaleString('en-US', { month: 'long' })}
                                                    </option>
                                                ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-primary transition-colors" />
                                    </div>

                                    <div className="relative group w-24">
                                        <select
                                            value={selectedDate.getFullYear()}
                                            onChange={(e) => {
                                                const newDate = new Date(selectedDate);
                                                newDate.setFullYear(parseInt(e.target.value));
                                                const today = new Date();
                                                if (parseInt(e.target.value) === today.getFullYear() && newDate.getMonth() > today.getMonth()) {
                                                    newDate.setMonth(today.getMonth());
                                                }
                                                setSelectedDate(newDate);
                                            }}
                                            className="w-full appearance-none bg-gray-50 border border-transparent hover:border-primary rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                                        >
                                            {Array.from({ length: 2026 - 2024 + 1 }, (_, i) => 2024 + i).map(year => (
                                                <option key={year} value={year} className="text-sm">{year}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-primary transition-colors" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 font-medium uppercase tracking-wider gap-y-4 mb-2 relative z-10">
                                <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                            </div>
                            <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-700 gap-y-3 relative z-10">
                                {getCalendarDays().map((day, idx) => {
                                    if (!day) return <div key={idx}></div>;

                                    const selected = isSameDate(day, selectedDate);
                                    const future = day > createToday();

                                    return (
                                        <div key={idx} className="flex justify-center">
                                            <button
                                                onClick={() => {
                                                    if (!future) setSelectedDate(day);
                                                }}
                                                disabled={future}
                                                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] transition ${selected
                                                    ? 'bg-primary text-white shadow-md transform scale-110'
                                                    : future
                                                        ? 'text-gray-300 cursor-not-allowed'
                                                        : 'hover:bg-purple-100 text-gray-700'
                                                    }`}
                                            >
                                                {day.getDate()}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-5 flex flex-col h-full overflow-hidden min-h-0">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Task List</h2>
                        <p className="text-sm text-gray-400">Today</p>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-3 min-h-0">
                        {tasks.map((task) => (
                            <div key={task.task_id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition group">
                                <div className="flex items-start gap-3">
                                    <div
                                        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${task.status === 'approved' ? 'bg-purple-100 border-primary text-primary' : 'border-gray-300'
                                            } ${isToday(selectedDate) ? 'cursor-pointer hover:border-primary' : 'cursor-default opacity-60'}`}
                                    >
                                        {task.status === 'approved' && <Check size={12} strokeWidth={3} />}
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-sm font-medium ${task.status === 'approved' ? 'text-gray-800' : 'text-gray-600'}`}>{task.title}</p>
                                        <p className="text-[10px] text-gray-400 mt-1">Due: {new Date(task.due_at).toLocaleDateString('en-GB')}, {new Date(task.due_at).toLocaleTimeString('en-GB').replace(/:/g, '.')}</p>
                                    </div>
                                    <div className="flex flex-col gap-2 items-center">
                                        <button type="button" className="bg-primary text-white text-[10px] font-bold py-1.5 px-4 rounded-lg transition shadow-sm flex items-center gap-1">
                                            <Camera size={12} /> Foto
                                        </button>
                                        {task.status !== 'approved' && (
                                            <button type="button" className="text-red-300 p-1 opacity-70 transition">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-4 flex flex-col h-full ease-in-out duration-300 min-h-0">
                    <div className="flex flex-col h-full min-h-0">
                        <div className="mb-4 shrink-0">
                            <h2 className="font-bold text-gray-800 text-lg">Activity</h2>
                            <p className="text-sm text-gray-400">
                                {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                        </div>
                        <div className="space-y-4 flex-1 overflow-y-auto pr-2 min-h-0">
                            {activityLogs.map((log) => (
                                <div key={log.id} className="bg-gray-200 rounded-xl p-4 flex items-center justify-between">
                                    <span className="text-sm font-bold text-gray-700">{log.time}</span>
                                    <span className="text-sm font-medium text-gray-600">Crew - {log.role}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
