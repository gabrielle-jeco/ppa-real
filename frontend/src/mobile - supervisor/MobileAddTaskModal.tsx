import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { getTaskWindowEndDate, isAfterTaskWindow, isBeforeToday, toDateFieldValue, toDateInputValue, toTimeFieldValue } from '../utils/taskDateWindow';
import useModalTransition from '../utils/useModalTransition';

interface MobileAddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (task: any) => void;
    defaultDate?: string;
    requireCategory?: boolean;
    initialTask?: any;
    submitLabel?: string;
}

export default function MobileAddTaskModal({ isOpen, onClose, onSubmit, defaultDate, requireCategory = false, initialTask, submitLabel = 'Buat Pekerjaan' }: MobileAddTaskModalProps) {
    const initializedKeyRef = useRef<string | null>(null);
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(defaultDate || '');
    const [startTime, setStartTime] = useState('');
    const [dueTime, setDueTime] = useState('');
    const [note, setNote] = useState('');
    const [workStationId, setWorkStationId] = useState('');
    const [weightLabel, setWeightLabel] = useState('mudah');
    const [workStations, setWorkStations] = useState<any[]>([]);
    const { shouldRender, animateIn, contentRef } = useModalTransition(isOpen);
    const minTaskDate = toDateInputValue(new Date());
    const maxTaskDate = toDateInputValue(getTaskWindowEndDate());
    const isTodayTask = date === minTaskDate;

    useEffect(() => {
        const modalKey = initialTask?.id ? `edit:${initialTask.id}` : `create:${defaultDate || ''}`;
        if (isOpen) {
            if (initializedKeyRef.current === modalKey) return;
            initializedKeyRef.current = modalKey;
            if (initialTask) {
                setTitle(initialTask.title || '');
                setDate(toDateFieldValue(initialTask.due_at, defaultDate || ''));
                setStartTime(toTimeFieldValue(initialTask.start_at, toTimeFieldValue(initialTask.due_at, new Date().toTimeString().slice(0, 5))));
                setDueTime(toTimeFieldValue(initialTask.due_at));
                setNote(initialTask.note || initialTask.description || '');
                setWorkStationId(initialTask.work_station_id ? String(initialTask.work_station_id) : '');
                setWeightLabel(initialTask.weight_label || 'mudah');
            } else {
                if (defaultDate) setDate(defaultDate);
                setStartTime(new Date().toTimeString().slice(0, 5));
                setDueTime('');
                setWeightLabel('mudah');
            }
        } else {
            initializedKeyRef.current = null;
            const resetTimer = window.setTimeout(() => {
                setTitle('');
                setDate(defaultDate || '');
                setStartTime('');
                setDueTime('');
                setNote('');
                setWorkStationId('');
                setWeightLabel('mudah');
            }, 300);

            return () => window.clearTimeout(resetTimer);
        }
    }, [isOpen, defaultDate, initialTask]);

    useEffect(() => {
        if (!isOpen || !requireCategory) return;

        const fetchWorkStations = async () => {
            const res = await fetch('/api/work-stations', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            if (res.ok) {
                setWorkStations(await res.json());
            }
        };

        fetchWorkStations();
    }, [isOpen, requireCategory]);

    if (!shouldRender) return null;

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
            title,
            start_at: startAt,
            due_at: dueAt,
            weight_label: weightLabel,
            note,
            ...(requireCategory ? { work_station_id: workStationId } : {}),
        });
        handleClose();
    };

    const handleClose = () => {
        initializedKeyRef.current = null;
        onClose();
    };

    return createPortal(
        <div className={`fixed inset-0 z-[30000] flex items-end justify-center sm:items-center p-0 sm:p-4 transition-colors duration-300 ${animateIn ? 'bg-black/50 backdrop-blur-[2px]' : 'bg-black/0 pointer-events-none'}`}>
            {/* Modal/Sheet Content */}
            <div
                ref={contentRef}
                className={`bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative transition-all duration-300 ease-out transform ${animateIn ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-full opacity-0 sm:translate-y-10 sm:scale-95'
                    }`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drag Handle (Mobile Visual) */}
                <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 sm:hidden"></div>

                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Pekerjaan Baru</h2>
                    <button
                        onClick={handleClose}
                        className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Judul</label>
                        <input
                            type="text"
                            placeholder="Contoh: Cek Kebersihan"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-5 py-4 text-gray-800 font-medium transition-all"
                            required
                        />
                    </div>

                    {requireCategory && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Kategori</label>
                            <select
                                value={workStationId}
                                onChange={(e) => setWorkStationId(e.target.value)}
                                className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-5 py-4 text-gray-800 font-medium transition-all capitalize"
                                required
                            >
                                <option value="">Pilih work station</option>
                                {workStations.map((station) => (
                                    <option key={station.id} value={station.id}>
                                        {station.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {/* Date Picker */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Tanggal</label>
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
                                    className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-4 py-4 text-sm text-gray-700 font-medium transition-all"
                                    required
                                />
                            </div>
                        </div>

                        {/* Time Picker */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Jam Mulai</label>
                            <div className="relative">
                                <input
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    disabled={isTodayTask}
                                    className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-4 py-4 text-sm text-gray-700 font-medium transition-all disabled:cursor-not-allowed disabled:text-gray-500"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Tenggat</label>
                            <input
                                type="time"
                                value={dueTime}
                                onChange={(e) => setDueTime(e.target.value)}
                                min={startTime}
                                className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-4 py-4 text-sm text-gray-700 font-medium transition-all"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Bobot</label>
                            <select
                                value={weightLabel}
                                onChange={(e) => setWeightLabel(e.target.value)}
                                className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-4 py-4 text-sm text-gray-700 font-medium transition-all"
                                required
                            >
                                <option value="mudah">Mudah (2)</option>
                                <option value="menengah">Menengah (6)</option>
                                <option value="sulit">Sulit (10)</option>
                            </select>
                        </div>
                    </div>

                    {/* Note Input */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Catatan (Opsional)</label>
                        <textarea
                            placeholder="Tambahkan detail pekerjaan..."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-5 py-4 text-sm text-gray-700 font-medium transition-all resize-none"
                        />
                        <p className="mt-1 text-[10px] text-gray-400">Tekan Enter untuk baris baru.</p>
                    </div>



                    <div className="pt-4">
                        <button
                            type="submit"
                            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 active:scale-95 transition-transform flex items-center justify-center gap-2"
                        >
                            <Check size={20} />
                            {submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
