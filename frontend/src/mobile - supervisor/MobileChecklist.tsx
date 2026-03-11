import React, { useState, useEffect, useRef } from 'react';
import { Camera, ChevronDown } from 'lucide-react';
import MobileLayout from './MobileLayout';
import MobileTaskPreview from './MobileTaskPreview';
import MobileSupervisorTaskDetail from './MobileSupervisorTaskDetail';

interface MobileChecklistProps {
    supervisor: any; // The logged-in supervisor
    onNavigate: (view: any, data?: any) => void;
}

const MobileChecklist: React.FC<MobileChecklistProps> = ({ supervisor, onNavigate }) => {
    const [myTasks, setMyTasks] = useState<any[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date());

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const isFutureDate = (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const t = new Date(today);
        t.setHours(0, 0, 0, 0);
        return d > t;
    };

    const getAvailableMonths = (year: number) => {
        if (year === currentYear) {
            return Array.from({ length: currentMonth + 1 }, (_, i) => i);
        }
        return Array.from({ length: 12 }, (_, i) => i);
    };

    // Upload & Detail State
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedTaskForUpload, setSelectedTaskForUpload] = useState<any>(null);

    useEffect(() => {
        if (supervisor?.id) {
            fetchMyTasks();
        }
    }, [supervisor?.id, selectedDate]);

    // FETCH MY TASKS (SUPERVISOR)
    const fetchMyTasks = async () => {
        if (!supervisor?.id) return;
        try {
            const token = localStorage.getItem('auth_token');
            const dateStr = selectedDate.toLocaleDateString('en-CA');
            const res = await fetch(`/api/supervisor/${supervisor.id}/tasks?date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMyTasks(data);
            }
        } catch (error) {
            console.error("Fetch my tasks failed", error);
        }
    };

    // --- NEW LOGIC: UNIFIED DETAIL & UPLOAD ---
    const handleTaskClick = (task: any) => {
        setSelectedTaskForUpload(task);
        setIsUploadModalOpen(true);
    };



    const completedCount = myTasks.filter(t => t.status === 'approved').length;
    const totalCount = myTasks.length;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

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

        // Empty slots
        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8 md:h-9"></div>);

        // Days
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i);
            const isSelected = i === selectedDate.getDate();
            const isFuture = isFutureDate(date);

            days.push(
                <button
                    key={i}
                    onClick={() => {
                        if (!isFuture) {
                            const newDate = new Date(selectedDate);
                            newDate.setDate(i);
                            setSelectedDate(newDate);
                        }
                    }}
                    disabled={isFuture}
                    className={`h-8 w-8 rounded-full flex flex-col items-center justify-center text-xs font-medium transition relative ${isSelected
                        ? 'bg-blue-600 text-white shadow-md'
                        : isFuture
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                >
                    {i}
                </button>
            );
        }
        return days;
    };

    return (
        <>
            <MobileLayout
                title="My Checklist"
                onBack={() => onNavigate('DASHBOARD')}
                allowScroll={false}
            >




                {/* Header: Date Selectors & Calendar */}
                <div className="bg-white rounded-3xl p-5 shadow-sm mb-4 shrink-0">
                    <div className="flex items-center gap-2 w-full mb-4">
                        <div className="relative group flex-1">
                            <select
                                value={selectedDate.getMonth()}
                                onChange={handleMonthChange}
                                className="w-full appearance-none bg-gray-50 border border-transparent hover:border-blue-100 rounded-xl px-3 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors"
                            >
                                {getAvailableMonths(selectedDate.getFullYear()).map(i => (
                                    <option key={i} value={i}>
                                        {new Date(0, i).toLocaleString('en-US', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
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
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                        </div>
                    </div>

                    <div className="mb-4">
                        <h4 className="font-bold text-gray-800 text-sm mb-3">Daily Assignments</h4>
                        {/* Day Names */}
                        <div className="grid grid-cols-7 text-center mb-2 border-b border-gray-100 pb-2">
                            {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(day => (
                                <span key={day} className="text-[10px] font-bold text-gray-400">{day}</span>
                            ))}
                        </div>

                        {/* Days Grid */}
                        <div className="grid grid-cols-7 gap-y-1 justify-items-center">
                            {renderCalendar()}
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <p className="text-xs text-gray-500">
                                Completed {completedCount}/{totalCount}
                            </p>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-3">
                            <div
                                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Scrollable Task List */}
                <div className="bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.03)] flex-1 flex flex-col min-h-0 relative -mx-2 px-2 pt-2">
                    {/* Handle Bar Indicator */}
                    <div className="flex justify-center mb-4 pt-3 shrink-0">
                        <div className="w-12 h-1.5 bg-blue-500/100 rounded-full"></div>
                    </div>

                    <div className="overflow-y-auto flex-1 px-3 pb-20 space-y-4">
                        {myTasks.length === 0 && (
                            <div className="text-center py-10 text-gray-400 text-sm">
                                No assignments for today.
                            </div>
                        )}

                        {myTasks.map(task => {
                            const isApproved = task.status === 'approved';
                            const isPastDue = new Date(task.due_at) < new Date(new Date().setHours(0, 0, 0, 0));
                            const isReadOnly = isApproved || isPastDue;

                            return (
                                <div key={task.task_id} className="bg-gray-100/50 rounded-2xl p-4 flex items-center justify-between group border border-transparent hover:border-gray-200 transition">
                                    <div className="flex items-start gap-3 flex-1">
                                        {/* Status Indicator (Read Only) */}
                                        <div className={`w-5 h-5 rounded-md border-2 mt-1 flex items-center justify-center transition-colors flex-shrink-0 cursor-default
                                    ${isApproved
                                                ? 'bg-blue-100 border-blue-500 text-blue-600'
                                                : 'border-gray-300 bg-gray-50'}`}
                                        >
                                            {isApproved && <span className="font-bold text-xs">✓</span>}
                                        </div>

                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-sm font-medium text-gray-700 leading-tight mb-1">{task.title}</p>
                                            <p className="text-[10px] text-gray-400 mb-0.5">Due {new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            {task.note && <div className="text-[10px] text-gray-500 italic truncate">{task.note}</div>}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => handleTaskClick(task)}
                                            className="bg-blue-600 text-white shadow-blue-200 text-[10px] font-bold py-2 px-4 rounded-xl shadow-md active:scale-95 transition-transform flex items-center gap-1"
                                        >
                                            <Camera size={14} />
                                            Foto
                                        </button>
                                    </div>

                                </div>
                            );
                        })}
                        <div className="h-10"></div>
                    </div>
                </div>
            </MobileLayout>

            {/* Detail / Upload Modal (Replacing Old Modals) */}
            {selectedTaskForUpload && isUploadModalOpen && (
                <MobileSupervisorTaskDetail
                    task={selectedTaskForUpload}
                    onClose={() => {
                        setIsUploadModalOpen(false);
                        setSelectedTaskForUpload(null);
                        fetchMyTasks(); // Refresh on close
                    }}
                    onUpload={async (formData) => {
                        const token = localStorage.getItem('auth_token');
                        const res = await fetch(`/api/tasks/${selectedTaskForUpload.task_id}/evidence`, { // Use EVIDENCE endpoint now
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData
                        });
                        if (!res.ok) {
                            const errText = await res.text();
                            throw new Error(errText);
                        }

                        // Parse the updated task from the response or fetch again
                        const data = await res.json();
                        setSelectedTaskForUpload(data);
                        fetchMyTasks();
                    }}
                    onDelete={async (evidenceId) => {
                        const token = localStorage.getItem('auth_token');
                        const res = await fetch(`/api/tasks/${selectedTaskForUpload.task_id}/evidence`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ evidence_id: evidenceId })
                        });
                        if (!res.ok) {
                            const errText = await res.text();
                            throw new Error(errText);
                        }
                        const data = await res.json();
                        setSelectedTaskForUpload(data.task);
                        fetchMyTasks();
                    }}
                />
            )}
        </>
    );
};

export default MobileChecklist;
