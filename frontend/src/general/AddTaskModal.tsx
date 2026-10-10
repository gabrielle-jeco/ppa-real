import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, X } from 'lucide-react';
import { getTaskWindowEndDate, isAfterTaskWindow, isBeforeToday, toDateFieldValue, toDateInputValue, toTimeFieldValue } from '../utils/taskDateWindow';
import { featureFlags } from '../utils/featureFlags';
import TaskCatalogFields from './TaskCatalogFields';

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (task: any) => void;
    defaultDate?: string; // YYYY-MM-DD
    requireCategory?: boolean;
    initialTask?: any;
    submitLabel?: string;
}

export default function AddTaskModal({ isOpen, onClose, onSubmit, defaultDate, requireCategory = false, initialTask, submitLabel = 'Simpan' }: AddTaskModalProps) {
    const initializedKeyRef = React.useRef<string | null>(null);
    const [date, setDate] = useState(defaultDate || '');
    const [startTime, setStartTime] = useState('');
    const [dueTime, setDueTime] = useState('');
    const [note, setNote] = useState('');
    const [workStationId, setWorkStationId] = useState('');
    const [taskAreaId, setTaskAreaId] = useState('');
    const [taskDefinitionId, setTaskDefinitionId] = useState('');
    const [weightLabel, setWeightLabel] = useState('mudah');
    const minTaskDate = toDateInputValue(new Date());
    const maxTaskDate = toDateInputValue(getTaskWindowEndDate());
    const isTodayTask = date === minTaskDate;
    const shouldShowCatalog = requireCategory || Boolean(initialTask);

    React.useEffect(() => {
        const modalKey = initialTask?.id ? `edit:${initialTask.id}` : `create:${defaultDate || ''}`;
        if (!isOpen) {
            initializedKeyRef.current = null;
            return;
        }
        if (initializedKeyRef.current === modalKey) return;
        initializedKeyRef.current = modalKey;

        if (initialTask) {
            setDate(toDateFieldValue(initialTask.due_at, defaultDate || ''));
            setStartTime(toTimeFieldValue(initialTask.start_at, toTimeFieldValue(initialTask.due_at, new Date().toTimeString().slice(0, 5))));
            setDueTime(toTimeFieldValue(initialTask.due_at));
            setNote(initialTask.note || initialTask.description || '');
            setWorkStationId(initialTask.work_station_id ? String(initialTask.work_station_id) : '');
            setTaskAreaId('');
            setTaskDefinitionId(initialTask.task_definition_id ? String(initialTask.task_definition_id) : '');
            setWeightLabel(initialTask.weight_label || 'mudah');
        } else {
            setDate(defaultDate || '');
            setStartTime(new Date().toTimeString().slice(0, 5));
            setDueTime('');
            setNote('');
            setWorkStationId('');
            setTaskAreaId('');
            setTaskDefinitionId('');
            setWeightLabel('mudah');
        }
    }, [isOpen, defaultDate, initialTask]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const now = new Date();
        let effectiveStartTime = startTime;
        let startAtDate = new Date(`${date}T${effectiveStartTime}:00`);
        if (date === toDateInputValue(now) && startAtDate < now) {
            effectiveStartTime = now.toTimeString().slice(0, 5);
            startAtDate = new Date(`${date}T${effectiveStartTime}:00`);
            setStartTime(effectiveStartTime);
        }

        const startAt = `${date} ${effectiveStartTime}:00`;
        const dueAt = `${date} ${dueTime}:00`;
        const selectedTaskDate = new Date(`${date}T00:00:00`);
        if (isBeforeToday(selectedTaskDate) || isAfterTaskWindow(selectedTaskDate)) {
            alert('Tanggal pekerjaan di luar periode penugasan yang diizinkan.');
            return;
        }
        if (new Date(dueAt.replace(' ', 'T')) < new Date()) {
            alert('Tenggat pekerjaan tidak boleh lebih awal dari jam saat ini.');
            return;
        }
        if (new Date(dueAt.replace(' ', 'T')) < startAtDate) {
            alert('Tenggat pekerjaan tidak boleh lebih awal dari jam mulai.');
            return;
        }
        onSubmit({
            task_definition_id: taskDefinitionId || null,
            start_at: startAt,
            due_at: dueAt,
            ...(featureFlags.taskWeight ? { weight_label: weightLabel } : {}),
            note,
        });
        onClose();
        // Reset form
        setDate('');
        setStartTime('');
        setDueTime('');
        setNote('');
        setWorkStationId('');
        setTaskAreaId('');
        setTaskDefinitionId('');
        setWeightLabel('mudah');
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4">
            <div
                className="relative w-full max-w-sm overflow-y-auto overscroll-contain rounded-3xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200"
                style={{ maxHeight: 'calc(100vh - 2rem)' }}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Tenggat Pekerjaan</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {shouldShowCatalog && (
                        <TaskCatalogFields
                            enabled={isOpen}
                            value={{ workStationId, taskAreaId, taskDefinitionId }}
                            onChange={(selection) => {
                                setWorkStationId(selection.workStationId);
                                setTaskAreaId(selection.taskAreaId);
                                setTaskDefinitionId(selection.taskDefinitionId);
                            }}
                            allowLegacy={Boolean(initialTask && !initialTask.task_definition_id)}
                            legacyTitle={initialTask?.title || ''}
                        />
                    )}

                    {/* Date Picker */}
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">Tanggal</label>
                        <div className="relative">
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => {
                                    setDate(e.target.value);
                                    if (!initialTask && e.target.value === minTaskDate) {
                                        setStartTime(new Date().toTimeString().slice(0, 5));
                                    }
                                }}
                                min={minTaskDate}
                                max={maxTaskDate}
                                className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 focus:ring-2 focus:ring-primary outline-none shadow-sm cursor-pointer"
                                required
                            />
                            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-purple-600">
                                <Calendar size={20} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">Jam mulai</label>
                            <input
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                disabled={isTodayTask}
                                className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 focus:ring-2 focus:ring-primary outline-none shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:text-gray-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">Tenggat</label>
                            <input
                                type="time"
                                value={dueTime}
                                onChange={(e) => setDueTime(e.target.value)}
                                min={startTime}
                                className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 focus:ring-2 focus:ring-primary outline-none shadow-sm cursor-pointer"
                                required
                            />
                        </div>
                    </div>

                    {featureFlags.taskWeight && (
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">Bobot</label>
                            <select
                                value={weightLabel}
                                onChange={(e) => setWeightLabel(e.target.value)}
                                className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 focus:ring-2 focus:ring-primary outline-none shadow-sm cursor-pointer"
                                required
                            >
                                <option value="mudah">Mudah (2)</option>
                                <option value="menengah">Menengah (6)</option>
                                <option value="sulit">Sulit (10)</option>
                            </select>
                        </div>
                    )}

                    {/* Note Input */}
                    <div>
                        <textarea
                            placeholder="Deskripsi pekerjaan"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={4}
                            className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-primary outline-none shadow-sm resize-none"
                        />
                        <p className="mt-1 text-[10px] text-gray-400">Tekan Enter untuk baris baru.</p>
                    </div>



                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            className="bg-primary text-white font-bold py-3 px-8 rounded-full hover:bg-purple-700 transition shadow-lg w-full md:w-auto"
                        >
                            {submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
