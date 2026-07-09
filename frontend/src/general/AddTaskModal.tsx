import React, { useState } from 'react';
import { Calendar, Clock, X } from 'lucide-react';
import { getTaskWindowEndDate, isAfterTaskWindow, isBeforeToday, toDateInputValue } from '../utils/taskDateWindow';

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (task: any) => void;
    defaultDate?: string; // YYYY-MM-DD
    requireCategory?: boolean;
}

export default function AddTaskModal({ isOpen, onClose, onSubmit, defaultDate, requireCategory = false }: AddTaskModalProps) {
    const formatCurrentTime = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(defaultDate || '');
    const [time, setTime] = useState('');
    const [note, setNote] = useState('');
    const [workStationId, setWorkStationId] = useState('');
    const [workStations, setWorkStations] = useState<any[]>([]);
    const [currentTime, setCurrentTime] = useState(formatCurrentTime);
    const minTaskDate = toDateInputValue(new Date());
    const maxTaskDate = toDateInputValue(getTaskWindowEndDate());
    const minTaskTime = date === minTaskDate
        ? new Date().toTimeString().slice(0, 5)
        : undefined;

    // Reset/Update date when defaultDate changes or modal opens
    React.useEffect(() => {
        if (isOpen && defaultDate) {
            setDate(defaultDate);
        }
    }, [isOpen, defaultDate]);

    React.useEffect(() => {
        if (!isOpen) return;

        const updateTime = () => setCurrentTime(formatCurrentTime());
        updateTime();
        const timer = window.setInterval(updateTime, 30000);

        return () => window.clearInterval(timer);
    }, [isOpen]);

    React.useEffect(() => {
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
        // Combine date and time
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
        onClose();
        // Reset form
        setTitle('');
        setDate('');
        setTime('');
        setNote('');
        setWorkStationId('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold text-gray-800 mb-3 text-center">Tenggat Pekerjaan</h2>
                <div className="mb-5 rounded-2xl bg-purple-50 px-4 py-3 text-xs font-bold text-primary flex items-center justify-between">
                    <span>Jam saat ini</span>
                    <span>{currentTime}</span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="text"
                            placeholder="Judul pekerjaan (contoh: Cek Kebersihan)"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-primary outline-none shadow-inner"
                            required
                        />
                    </div>

                    {requireCategory && (
                        <div>
                            <select
                                value={workStationId}
                                onChange={(e) => setWorkStationId(e.target.value)}
                                className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 focus:ring-2 focus:ring-primary outline-none shadow-sm cursor-pointer capitalize"
                                required
                            >
                                <option value="">Pilih Kategori</option>
                                {workStations.map((station) => (
                                    <option key={station.id} value={station.id}>
                                        {station.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Date Picker */}
                    <div className="relative">
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            min={minTaskDate}
                            max={maxTaskDate}
                            className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 focus:ring-2 focus:ring-primary outline-none shadow-sm cursor-pointer"
                            required
                        />
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-purple-600">
                            <Calendar size={20} />
                        </div>
                    </div>

                    {/* Time Picker */}
                    <div className="relative">
                        <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            min={minTaskTime}
                            className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 focus:ring-2 focus:ring-primary outline-none shadow-sm cursor-pointer"
                            required
                        />
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-purple-600">
                            <Clock size={20} />
                        </div>
                    </div>

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
                            Simpan
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
