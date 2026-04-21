import React, { useState, useEffect } from 'react';
import { Camera, ChevronDown } from 'lucide-react';
import CrewLayout from './CrewLayout';

interface MobileTaskListProps {
    user: any;
    onBack: () => void;
    onSelectTask: (task: any) => void;
    refreshTrigger?: number;
    selectedRole: string;
}

export default function MobileTaskList({ user, onBack, onSelectTask, refreshTrigger, selectedRole }: MobileTaskListProps) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [guideRequired, setGuideRequired] = useState(false);
    const [guideMessage, setGuideMessage] = useState('');

    // Fetch Tasks
    useEffect(() => {
        const fetchTasks = async () => {
            setLoading(true);
            try {
                // Format date as YYYY-MM-DD (Local Time)
                const offset = selectedDate.getTimezoneOffset();
                const localDate = new Date(selectedDate.getTime() - (offset * 60 * 1000));
                const dateStr = localDate.toISOString().split('T')[0];
                const response = await fetch(`/api/crews/${user.user_id}/tasks?date=${dateStr}&role=${selectedRole}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    setTasks(data);
                    setGuideRequired(false);
                    setGuideMessage('');
                } else if (response.status === 423) {
                    const data = await response.json();
                    setTasks([]);
                    setGuideRequired(true);
                    setGuideMessage(data.message || 'Please confirm today\'s guide before accessing your tasks.');
                }
            } catch (error) {
                console.error("Failed to fetch tasks", error);
            } finally {
                setLoading(false);
            }
        };

        if (user?.user_id) {
            fetchTasks();
        }
    }, [selectedDate, user?.user_id, refreshTrigger, selectedRole]);

    const completedCount = tasks.filter(t => t.status === 'approved').length;
    const totalCount = tasks.length;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return (
        <CrewLayout
            title="Daily Task"
            showBack={true}
            onBack={onBack}
            allowScroll={false}
        >
            <div className="flex flex-col h-full">
                {/* 1. Header: Progress Bar Only (No Calendar) */}
                <div className="bg-white rounded-3xl p-6 shadow-sm mb-4 shrink-0 border border-gray-100">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-sm font-bold text-gray-600">
                            Task Completed <span className="text-gray-900">{completedCount}/{totalCount}</span>
                        </p>
                        <span className="text-sm font-bold text-blue-600">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                        <div
                            className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>

                {/* 2. Task List */}
                <div className="bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.03)] flex-1 flex flex-col min-h-0 relative -mx-2 px-2 pt-2">
                    {/* Handle Bar Indicator */}
                    <div className="flex justify-center mb-4 pt-3 shrink-0">
                        <div className="w-12 h-1.5 bg-blue-500/100 rounded-full"></div>
                    </div>

                    <div className="overflow-y-auto flex-1 px-3 pb-20 space-y-3">
                        {loading ? (
                            <div className="flex justify-center py-10 text-gray-400">Loading tasks...</div>
                        ) : guideRequired ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400 px-4">
                                <p className="font-medium text-gray-500 mb-2">Task access is locked.</p>
                                <p>{guideMessage}</p>
                            </div>
                        ) : tasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                                <p>No tasks for this date.</p>
                            </div>
                        ) : (
                            tasks.map((task) => {
                                const isCompleted = task.status === 'approved';
                                return (
                                    <div key={task.task_id} className="bg-gray-100/50 rounded-2xl p-4 flex items-center justify-between group border border-transparent hover:border-gray-200 transition">
                                        <div className="flex items-start gap-3 flex-1">
                                            {/* Status Indicator */}
                                            <div className={`w-5 h-5 rounded-md border-2 mt-1 flex items-center justify-center transition-colors flex-shrink-0 cursor-default
                                            ${isCompleted
                                                    ? 'bg-blue-100 border-blue-500 text-blue-600'
                                                    : 'border-gray-300 bg-gray-50'}`}
                                            >
                                                {isCompleted && <span className="font-bold text-xs">✓</span>}
                                            </div>

                                            <div className="flex-1 min-w-0 pr-2">
                                                <p className={`text-sm font-medium leading-tight mb-1 ${isCompleted ? 'text-gray-500' : 'text-gray-700'}`}>
                                                    {task.title}
                                                </p>
                                                <p className="text-[10px] text-gray-400 mb-0.5">Due {new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                {task.note && <div className="text-[10px] text-gray-500 italic truncate">{task.note}</div>}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={() => onSelectTask(task)}
                                                className="text-[10px] font-bold py-2 px-4 rounded-xl shadow-md active:scale-95 transition-transform flex items-center gap-1 bg-blue-600 text-white shadow-blue-200"
                                            >
                                                <Camera size={14} />
                                                Foto
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div className="h-10"></div>
                    </div>
                </div>
            </div>
        </CrewLayout>
    );
}
