import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, Camera } from 'lucide-react';
import MobileLayout from './MobileLayout';
import MobileAddTaskModal from './MobileAddTaskModal';
import MobileTaskPreview from './MobileTaskPreview';
import MobileEvidenceListModal from '../mobile - crew/MobileEvidenceListModal';

interface MobileCrewDetailProps {
    crew: any;
    onNavigate: (view: any, data?: any) => void;
}

const MobileCrewDetail: React.FC<MobileCrewDetailProps> = ({ crew, onNavigate }) => {
    const [tasks, setTasks] = useState<any[]>([]); // Crew Tasks
    const [selectedDate] = useState(new Date());
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

    // Preview State
    const [previewTask, setPreviewTask] = useState<any>(null);
    const [isEvidenceListOpen, setIsEvidenceListOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    useEffect(() => {
        if (crew?.id) {
            fetchTasks();
        }
    }, [crew?.id, selectedDate]);

    // FETCH TASKS (CREW)
    const fetchTasks = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const dateStr = selectedDate.toLocaleDateString('en-CA');
            const res = await fetch(`/api/supervisor/${crew.id}/tasks?date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTasks(data);
            }
        } catch (error) {
            console.error("Fetch tasks failed", error);
        }
    };

    // ADD TASK
    const handleAddTask = async (taskData: any) => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    supervisor_id: crew.id, // Target User ID
                    ...taskData
                })
            });
            if (res.ok) fetchTasks();
        } catch (error) {
            console.error("Add task failed", error);
        }
    };

    // UPDATE STATUS
    const handleUpdateStatus = async (taskId: number, newStatus: string) => {
        setTasks(tasks.map(t => t.task_id === taskId ? { ...t, status: newStatus } : t));
        if (previewTask?.task_id === taskId) {
            setPreviewTask({ ...previewTask, status: newStatus });
        }
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`/api/tasks/${taskId}/status`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
        } catch (error) {
            console.error("Status update failed", error);
            fetchTasks();
        }
    };

    // TOGGLE STATUS (Checkbox)
    const handleToggleStatus = async (task: any) => {
        const newStatus = task.status === 'approved' ? 'pending' : 'approved';
        handleUpdateStatus(task.task_id, newStatus);
    };

    // DELETE TASK
    const handleDeleteTask = async (taskId: number) => {
        if (!window.confirm("Delete this task?")) return;
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`/api/tasks/${taskId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setTasks(tasks.filter(t => t.task_id !== taskId));
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    // DELETE PROOF
    const handleDeleteProof = async (evidenceId: number) => {
        if (!previewTask) return;
        const taskId = previewTask.task_id;
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) throw new Error("No token found");

            const res = await fetch(`/api/tasks/${taskId}/evidence`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ evidence_id: evidenceId })
            });

            if (res.ok) {
                // Update local state by removing the specific evidence
                setTasks(tasks.map(t => t.task_id === taskId ? {
                    ...t,
                    evidences: (t.evidences || []).filter((e: any) => e.id !== evidenceId)
                } : t));
                setPreviewTask({
                    ...previewTask,
                    evidences: (previewTask.evidences || []).filter((e: any) => e.id !== evidenceId)
                });
            } else {
                alert('Failed to delete image.');
            }
        } catch (error) {
            console.error('Error deleting image:', error);
            alert('An error occurred.');
        }
    };
    const [activeEvidenceTab, setActiveEvidenceTab] = useState<'before' | 'after'>('before');
    const [initialPreviewIndex, setInitialPreviewIndex] = useState(0);

    const handleViewPhoto = (task: any) => {
        setPreviewTask(task);
        setIsEvidenceListOpen(true);
    };

    const completedCount = tasks.filter(t => t.status === 'approved').length;
    const totalCount = tasks.length;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    const isToday = (date: Date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    return (
        <MobileLayout
            title={crew.full_name || crew.name}
            onBack={() => onNavigate('EMPLOYEE_LIST')}
            allowScroll={false} // Lock window scroll, handle internally
        >
            <MobileAddTaskModal
                isOpen={isTaskModalOpen}
                onClose={() => setIsTaskModalOpen(false)}
                onSubmit={handleAddTask}
                defaultDate={selectedDate.toLocaleDateString('en-CA')}
            />

            <MobileEvidenceListModal
                isOpen={isEvidenceListOpen}
                onClose={() => setIsEvidenceListOpen(false)}
                task={previewTask}
                onSelectImage={(type, index = 0) => {
                    setActiveEvidenceTab(type as 'before' | 'after');
                    setInitialPreviewIndex(index);
                    setIsPreviewOpen(true);
                }}
                onDelete={!isToday(selectedDate) ? undefined : (evidenceId) => handleDeleteProof(evidenceId)}
                readOnly={previewTask?.status === 'approved' || !isToday(selectedDate)}
            />

            <MobileTaskPreview
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                task={previewTask}
                activeTab={activeEvidenceTab}
                onTabChange={setActiveEvidenceTab}
                initialIndex={initialPreviewIndex}
                onDeleteProof={(evidenceId) => handleDeleteProof(evidenceId)}
                onUpdateStatus={(status) => handleUpdateStatus(previewTask.task_id, status)}
                readOnly={previewTask?.status === 'approved' || (previewTask && new Date(previewTask.due_at) < new Date(new Date().setHours(0, 0, 0, 0)))}
            />

            {/* CARD 1: Profile & History (Static) */}
            <div className="bg-white rounded-3xl p-5 shadow-sm mb-4 flex justify-between items-center shrink-0">
                <p className="text-gray-600 font-medium text-sm">
                    Role as <span className="underline decoration-gray-400">{crew.current_workstation ? `Crew - ${crew.current_workstation}` : 'Crew'}</span> Today
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={() => onNavigate('EVALUATION', crew)}
                        className="bg-blue-600 text-white text-xs font-bold py-2 px-4 rounded-full shadow-md active:scale-95 transition-transform"
                    >
                        Evaluation
                    </button>
                    <button
                        onClick={() => onNavigate('HISTORY', crew)}
                        className="bg-blue-600 text-white text-xs font-bold py-2 px-6 rounded-full shadow-md active:scale-95 transition-transform"
                    >
                        History
                    </button>
                </div>
            </div>

            {/* CARD 2: Task Filter & Progress */}
            <div className="bg-white rounded-3xl p-5 shadow-sm mb-4 shrink-0 border border-gray-100">
                {/* Dropdown / Filter Header */}
                <h4 className="font-bold text-gray-800 text-sm mb-3">Task</h4>
                <div className="relative mb-3 h-12">
                    <button
                        onClick={() => setIsTaskModalOpen(true)}
                        disabled={!isToday(selectedDate)}
                        className={`w-full h-full border rounded-xl px-4 flex items-center justify-between text-xs font-semibold shadow-sm transition group ${isToday(selectedDate)
                            ? 'bg-white border-gray-200 hover:border-blue-600 text-gray-600 hover:text-blue-600 cursor-pointer'
                            : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        <span className="text-sm">{isToday(selectedDate) ? 'Choose Task' : 'History View'}</span>
                        {isToday(selectedDate) && (
                            <span className="bg-gray-100 group-hover:bg-blue-100 text-gray-500 group-hover:text-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xl leading-none pb-0.5 transition-colors">+</span>
                        )}
                    </button>
                </div>

                {/* Progress Bar (Matched to Crew) */}
                <div>
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
            </div>

            {/* CARD 3: Task List (Scrollable) */}
            <div className="bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.03)] flex-1 flex flex-col min-h-0 relative -mx-2 px-2 pt-2">

                {/* Handle Bar Indicator */}
                <div className="flex justify-center mb-4 pt-3 shrink-0">
                    <div className="w-12 h-1.5 bg-blue-500/100 rounded-full"></div>
                </div>

                {/* Scrollable List Container */}
                <div className="overflow-y-auto flex-1 px-3 pb-20 space-y-3">
                    {tasks.length === 0 && (
                        <div className="text-center py-10 text-gray-400 text-sm">
                            No tasks for this date.
                        </div>
                    )}

                    {tasks.map(task => {
                        const isApproved = task.status === 'approved';
                        const isPastDue = new Date(task.due_at) < new Date(new Date().setHours(0, 0, 0, 0));
                        const isReadOnly = isApproved || isPastDue;

                        return (
                            <div key={task.task_id} className="bg-gray-100/50 rounded-2xl p-4 flex items-center justify-between group border border-transparent hover:border-gray-200 transition">
                                <div className="flex items-start gap-3 flex-1">
                                    {/* Status Checkbox */}
                                    <div
                                        onClick={() => !isPastDue && handleToggleStatus(task)}
                                        className={`w-5 h-5 rounded-md border-2 mt-1 flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer
                                        ${isApproved
                                                ? 'bg-blue-100 border-blue-500 text-blue-600'
                                                : isPastDue ? 'border-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-300 bg-white hover:border-blue-500'}`}
                                    >
                                        {isApproved && <span className="font-bold text-xs">✓</span>}
                                    </div>

                                    <div className="flex-1 min-w-0 pr-2">
                                        <p className={`text-sm font-medium leading-tight mb-1 ${isApproved ? 'text-gray-500' : 'text-gray-700'}`}>
                                            {task.title}
                                        </p>
                                        <p className="text-[10px] text-gray-400 mb-0.5">Due {new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        {task.note && <div className="text-[10px] text-gray-500 italic truncate">{task.note}</div>}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 items-end">
                                    <button
                                        onClick={() => handleViewPhoto(task)}
                                        className="bg-blue-600 text-white shadow-blue-200 text-[10px] font-bold py-2 px-4 rounded-xl shadow-md active:scale-95 transition-transform flex items-center gap-1"
                                    >
                                        <Camera size={14} />
                                        Foto
                                    </button>
                                    {(!isPastDue && !isApproved) && (
                                        <button
                                            onClick={() => handleDeleteTask(task.task_id)}
                                            className="text-red-300 hover:text-red-500 p-1 transition"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Padding Bottom for safe scrolling */}
                    <div className="h-10"></div>
                </div>
            </div>
        </MobileLayout>
    );
};

export default MobileCrewDetail;
