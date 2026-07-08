import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { getTaskWindowEndDate, isAfterTaskWindow, isBeforeToday, toDateInputValue } from '../utils/taskDateWindow';

interface MobileAddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (task: any) => void;
    defaultDate?: string;
    requireCategory?: boolean;
}

export default function MobileAddTaskModal({ isOpen, onClose, onSubmit, defaultDate, requireCategory = false }: MobileAddTaskModalProps) {
    const formatCurrentTime = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(defaultDate || '');
    const [time, setTime] = useState('');
    const [note, setNote] = useState('');
    const [workStationId, setWorkStationId] = useState('');
    const [workStations, setWorkStations] = useState<any[]>([]);
    const [animateIn, setAnimateIn] = useState(false);
    const [currentTime, setCurrentTime] = useState(formatCurrentTime);
    const minTaskDate = toDateInputValue(new Date());
    const maxTaskDate = toDateInputValue(getTaskWindowEndDate());
    const minTaskTime = date === minTaskDate
        ? new Date().toTimeString().slice(0, 5)
        : undefined;

    useEffect(() => {
        if (isOpen) {
            setAnimateIn(true);
            if (defaultDate) setDate(defaultDate);
        } else {
            setAnimateIn(false);
        }
    }, [isOpen, defaultDate]);

    useEffect(() => {
        if (!isOpen) return;

        const updateTime = () => setCurrentTime(formatCurrentTime());
        updateTime();
        const timer = window.setInterval(updateTime, 30000);

        return () => window.clearInterval(timer);
    }, [isOpen]);

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

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const dueAt = `${date} ${time}:00`;
        const selectedTaskDate = new Date(`${date}T00:00:00`);
        if (isBeforeToday(selectedTaskDate) || isAfterTaskWindow(selectedTaskDate)) {
            alert('Tanggal pekerjaan di luar periode penugasan yang diizinkan.');
            return;
        }
        if (new Date(dueAt.replace(' ', 'T')) < new Date()) {
            alert('Tenggat pekerjaan tidak boleh lebih awal dari jam saat ini.');
            return;
        }
        onSubmit({
            title,
            due_at: dueAt,
            note,
            ...(requireCategory ? { work_station_id: workStationId } : {}),
        });
        handleClose();
    };

    const handleClose = () => {
        setAnimateIn(false);
        setTimeout(() => {
            onClose();
            // Reset form
            setTitle('');
            setDate(defaultDate || '');
            setTime('');
            setNote('');
            setWorkStationId('');
        }, 300); // Match transition duration
    };

    return (
        <div className={`fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 transition-colors duration-300 ${animateIn ? 'bg-black/50 backdrop-blur-[2px]' : 'bg-black/0 pointer-events-none'}`}>
            {/* Modal/Sheet Content */}
            <div
                className={`bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative transition-transform duration-300 ease-out transform ${animateIn ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-full opacity-0 scale-95'
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
                <div className="mb-5 rounded-2xl bg-blue-50 px-4 py-3 text-xs font-bold text-blue-600 flex items-center justify-between">
                    <span>Jam saat ini</span>
                    <span>{currentTime}</span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Judul</label>
                        <input
                            type="text"
                            placeholder="e.g. Cek Kebersihan"
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
                                    onChange={(e) => setDate(e.target.value)}
                                    min={minTaskDate}
                                    max={maxTaskDate}
                                    className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-4 py-4 text-sm text-gray-700 font-medium transition-all"
                                    required
                                />
                            </div>
                        </div>

                        {/* Time Picker */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Jam</label>
                            <div className="relative">
                                <input
                                    type="time"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                    min={minTaskTime}
                                    className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-4 py-4 text-sm text-gray-700 font-medium transition-all"
                                    required
                                />
                            </div>
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
                    </div>



                    <div className="pt-4">
                        <button
                            type="submit"
                            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 active:scale-95 transition-transform flex items-center justify-center gap-2"
                        >
                            <Check size={20} />
                            Buat Pekerjaan
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
