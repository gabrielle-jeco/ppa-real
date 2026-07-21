import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, Camera, Edit3 } from 'lucide-react';
import MobileLayout from './MobileLayout';
import MobileAddTaskModal from './MobileAddTaskModal';
import MobileTaskPreview from './MobileTaskPreview';
import MobileEvidenceListModal from '../mobile - crew/MobileEvidenceListModal';
import { notifyApprovalGrace } from '../utils/browserNotifications';
import BulkTaskModal from '../general/BulkTaskModal';
import TaskStartStatus from '../general/TaskStartStatus';
import MobileDraggableSheet from '../general/MobileDraggableSheet';
import { isTaskNotStarted } from '../utils/taskTiming';

interface MobileCrewDetailProps {
    crew: any;
    onNavigate: (view: any, data?: any) => void;
}

const MobileCrewDetail: React.FC<MobileCrewDetailProps> = ({ crew, onNavigate }) => {
    const [tasks, setTasks] = useState<any[]>([]); // Crew Tasks
    const [selectedDate] = useState(new Date());
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isBulkTaskModalOpen, setIsBulkTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<any>(null);
    const [editingBatch, setEditingBatch] = useState<any>(null);

    // Preview State
    const [previewTask, setPreviewTask] = useState<any>(null);
    const [isEvidenceListOpen, setIsEvidenceListOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    useEffect(() => {
        if (crew?.id) {
            fetchTasks();
        }
    }, [crew?.id, selectedDate]);

    useEffect(() => {
        if (!crew?.id) return;

        const timer = window.setInterval(fetchTasks, 15000);
        return () => window.clearInterval(timer);
    }, [crew?.id, selectedDate]);

    useEffect(() => {
        tasks.forEach(notifyApprovalGrace);
    }, [tasks]);

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
            console.error("Gagal mengambil tugas", error);
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
            console.error("Gagal menambahkan tugas", error);
        }
    };

    const handleBulkAddTask = async (taskData: any) => {
        try {
            const token = localStorage.getItem('auth_token');
            const isEditingBatch = Boolean(editingBatch?.id);
            const res = await fetch(isEditingBatch ? `/api/task-batches/${editingBatch.id}` : '/api/tasks/bulk', {
                method: isEditingBatch ? 'PATCH' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            });
            if (res.ok) {
                setEditingBatch(null);
                fetchTasks();
            }
            else {
                const data = await res.json().catch(() => ({}));
                alert(data.message || (isEditingBatch ? 'Gagal memperbarui Bulk Assignment.' : 'Gagal membuat Bulk Assignment.'));
            }
        } catch (error) {
            console.error("Gagal membuat Bulk Assignment", error);
        }
    };

    const handleUpdateTask = async (taskData: any) => {
        if (!editingTask) return;
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/tasks/${editingTask.task_id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            });
            if (res.ok) {
                setEditingTask(null);
                fetchTasks();
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.message || 'Gagal memperbarui tugas.');
            }
        } catch (error) {
            console.error("Gagal memperbarui tugas", error);
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
            console.error("Gagal memperbarui status", error);
            fetchTasks();
        }
    };

    // TOGGLE STATUS (Checkbox)
    const handleToggleStatus = async (task: any) => {
        if (!canApproveTask(task)) {
            return;
        }

        const newStatus = task.status === 'approved' ? 'pending' : 'approved';
        handleUpdateStatus(task.task_id, newStatus);
    };

    // DELETE TASK
    const handleDeleteTask = async (taskId: number) => {
        if (!window.confirm("Hapus tugas ini?")) return;
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`/api/tasks/${taskId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchTasks();
        } catch (error) {
            console.error("Gagal menghapus tugas", error);
        }
    };

    // DELETE PROOF
    const handleDeleteProof = async (evidenceId: number) => {
        if (!previewTask) return;
        const taskId = previewTask.task_id;
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) throw new Error("Token tidak ditemukan");

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
                alert('Gagal menghapus foto.');
            }
        } catch (error) {
            console.error('Gagal menghapus foto:', error);
            alert('Terjadi kesalahan.');
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
    const canApproveTask = (task: any) => addApprovalGraceDay(new Date(task.due_at)).getTime() >= Date.now();

    const addApprovalGraceDay = (date: Date) => {
        const result = new Date(date);
        result.setHours(result.getHours() + 24);
        return result;
    };

    const isTaskPastDue = (task: any) => new Date(task.due_at) < new Date();
    const canEditTask = (task: any) => (
        (task.assignment_type || 'individual') === 'individual'
        && task.status !== 'approved'
        && (task.evidences || []).length === 0
        && !isTaskPastDue(task)
    );
    const canEditBatchTask = (task: any) => (
        (task.assignment_type || 'individual') !== 'individual'
        && task.assignment_batch
        && task.status !== 'approved'
        && (task.evidences || []).length === 0
        && !isTaskPastDue(task)
    );
    const closeBulkTaskModal = () => {
        setIsBulkTaskModalOpen(false);
        setEditingBatch(null);
    };
    const openBulkTaskModal = () => {
        setEditingBatch(null);
        setIsBulkTaskModalOpen(true);
    };
    const openBatchEditor = (batch: any) => {
        setIsBulkTaskModalOpen(false);
        setEditingBatch(batch);
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
                requireCategory
            />
            <MobileAddTaskModal
                isOpen={!!editingTask}
                onClose={() => setEditingTask(null)}
                onSubmit={handleUpdateTask}
                defaultDate={selectedDate.toLocaleDateString('en-CA')}
                requireCategory
                initialTask={editingTask}
                submitLabel="Simpan Perubahan"
            />
            <BulkTaskModal
                isOpen={isBulkTaskModalOpen || !!editingBatch}
                onClose={closeBulkTaskModal}
                onSubmit={handleBulkAddTask}
                defaultDate={selectedDate.toLocaleDateString('en-CA')}
                accent="blue"
                mobileSheet
                initialBatch={editingBatch}
                submitLabel={editingBatch ? 'Simpan Perubahan' : 'Buat Penugasan'}
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
                readOnly={previewTask?.status === 'approved' || (previewTask && isTaskPastDue(previewTask)) || (previewTask && isTaskNotStarted(previewTask)) || !isToday(selectedDate)}
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
                readOnly={previewTask?.status === 'approved' || (previewTask && isTaskPastDue(previewTask)) || (previewTask && isTaskNotStarted(previewTask))}
            />

            {/* CARD 1: Profile & History (Static) */}
            <div className="bg-white rounded-3xl p-5 shadow-sm mb-4 flex justify-between items-center shrink-0">
                <p className="text-gray-600 font-medium text-sm">
                    Role sebagai <span className="underline decoration-gray-400">{crew.current_workstation ? `Crew - ${crew.current_workstation}` : 'Crew'}</span> hari ini
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={() => onNavigate('EVALUATION', crew)}
                        className="bg-blue-600 text-white text-xs font-bold py-2 px-4 rounded-full shadow-md active:scale-95 transition-transform"
                    >
                        Evaluasi
                    </button>
                    <button
                        onClick={() => onNavigate('HISTORY', crew)}
                        className="bg-blue-600 text-white text-xs font-bold py-2 px-6 rounded-full shadow-md active:scale-95 transition-transform"
                    >
                        Riwayat
                    </button>
                </div>
            </div>

            {/* CARD 2: Task Filter & Progress */}
            <div className="bg-white rounded-3xl p-5 shadow-sm mb-4 shrink-0 border border-gray-100">
                {/* Dropdown / Filter Header */}
                <h4 className="font-bold text-gray-800 text-sm mb-3">Tugas</h4>
                <div className="relative mb-3 grid grid-cols-[1fr_auto] gap-2">
                    <button
                        onClick={() => setIsTaskModalOpen(true)}
                        disabled={!isToday(selectedDate)}
                        className={`h-12 border rounded-xl px-4 flex items-center justify-between text-xs font-semibold shadow-sm transition group ${isToday(selectedDate)
                            ? 'bg-white border-gray-200 hover:border-blue-600 text-gray-600 hover:text-blue-600 cursor-pointer'
                            : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        <span className="text-sm">{isToday(selectedDate) ? 'Tambah Tugas' : 'Lihat Riwayat'}</span>
                        {isToday(selectedDate) && (
                            <span className="bg-gray-100 group-hover:bg-blue-100 text-gray-500 group-hover:text-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xl leading-none pb-0.5 transition-colors">+</span>
                        )}
                    </button>
                    <button
                        onClick={openBulkTaskModal}
                        disabled={!isToday(selectedDate)}
                        className={`h-12 px-4 rounded-xl text-xs font-bold shadow-sm transition ${isToday(selectedDate)
                            ? 'bg-blue-600 text-white active:scale-95'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        Bulk Assignment
                    </button>
                </div>

                {/* Progress Bar (Matched to Crew) */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-sm font-bold text-gray-600">
                            Tugas Selesai <span className="text-gray-900">{completedCount}/{totalCount}</span>
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
            <MobileDraggableSheet
                className="bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.03)] flex-1 flex flex-col min-h-0 relative -mx-2 px-2 pt-2"
                handleClassName="mb-4 pt-3 shrink-0"
            >

                {/* Scrollable List Container */}
                <div className="overflow-y-auto flex-1 px-3 pb-20 space-y-3">
                    {tasks.length === 0 && (
                        <div className="text-center py-10 text-gray-400 text-sm">
                            Tidak ada tugas pada tanggal ini.
                        </div>
                    )}

                    {tasks.map(task => {
                        const isApproved = task.status === 'approved';
                        const isPastDue = isTaskPastDue(task);
                        const isReadOnly = isApproved || isPastDue;

                        return (
                            <div key={task.task_id} className="bg-gray-100/50 rounded-2xl p-4 flex items-center justify-between group border border-transparent hover:border-gray-200 transition">
                                <div className="flex items-start gap-3 flex-1">
                                    {/* Status Checkbox */}
                                    <div
                                        onClick={() => canApproveTask(task) && handleToggleStatus(task)}
                                        className={`w-5 h-5 rounded-md border-2 mt-1 flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer
                                        ${isApproved
                                                ? 'bg-blue-100 border-blue-500 text-blue-600'
                                                : canApproveTask(task) ? 'border-gray-300 bg-white hover:border-blue-500' : 'border-gray-300 bg-gray-50 cursor-not-allowed'}`}
                                    >
                                        {isApproved && <Check size={14} strokeWidth={3} />}
                                    </div>

                                    <div className="flex-1 min-w-0 pr-2">
                                        <p className={`text-sm font-medium leading-tight mb-1 ${isApproved ? 'text-gray-500' : 'text-gray-700'}`}>
                                            {task.title}
                                        </p>
                                        <p className="text-[10px] text-blue-600 font-bold capitalize mb-0.5">Kategori: {task.work_station?.name || 'Umum'}</p>
                                        <TaskStartStatus
                                            task={task}
                                            scheduleClassName="text-[10px] text-gray-400 mb-0.5"
                                            statusClassName="text-[10px] text-amber-500 font-semibold mb-0.5"
                                        />
                                        <p className="text-[10px] text-gray-400 mb-0.5">Tenggat {new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        <p className="text-[10px] text-gray-400 mb-0.5 capitalize">Bobot {task.weight_label || 'mudah'} ({task.weight_value || 2})</p>
                                        {task.note && <div className="text-[10px] text-gray-500 leading-snug whitespace-pre-line break-words">{task.note}</div>}
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
                                    {canEditTask(task) && (
                                        <button
                                            onClick={() => setEditingTask(task)}
                                            className="text-gray-400 hover:text-blue-600 p-1 transition"
                                            title="Edit tugas"
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                    )}
                                    {canEditBatchTask(task) && (
                                        <button
                                            onClick={() => openBatchEditor(task.assignment_batch)}
                                            className="text-gray-400 hover:text-blue-600 p-1 transition"
                                            title="Edit Bulk Assignment"
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Padding Bottom for safe scrolling */}
                    <div className="h-10"></div>
                </div>
            </MobileDraggableSheet>
        </MobileLayout>
    );
};

export default MobileCrewDetail;
