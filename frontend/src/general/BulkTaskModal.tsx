import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock, X } from 'lucide-react';
import { getTaskWindowEndDate, isAfterTaskWindow, isBeforeToday, toDateFieldValue, toDateInputValue, toTimeFieldValue } from '../utils/taskDateWindow';
import useModalTransition from '../utils/useModalTransition';

type CrewOption = { id: string; name: string };

interface BulkTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (task: any) => Promise<void> | void;
    crews?: CrewOption[];
    defaultDate?: string;
    accent?: 'purple' | 'blue';
    initialBatch?: any;
    submitLabel?: string;
    mobileSheet?: boolean;
}

const dayOptions = [
    { value: 1, label: 'Sen' },
    { value: 2, label: 'Sel' },
    { value: 3, label: 'Rab' },
    { value: 4, label: 'Kam' },
    { value: 5, label: 'Jum' },
    { value: 6, label: 'Sab' },
    { value: 0, label: 'Min' },
];

export default function BulkTaskModal({ isOpen, onClose, onSubmit, crews, defaultDate, accent = 'purple', initialBatch, submitLabel = 'Buat Penugasan', mobileSheet = false }: BulkTaskModalProps) {
    const initializedKeyRef = useRef<string | null>(null);
    const [crewOptions, setCrewOptions] = useState<CrewOption[]>(crews || []);
    const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
    const [workStations, setWorkStations] = useState<any[]>([]);
    const [title, setTitle] = useState('');
    const [workStationId, setWorkStationId] = useState('');
    const [startDate, setStartDate] = useState(defaultDate || toDateInputValue(new Date()));
    const [endDate, setEndDate] = useState(defaultDate || toDateInputValue(new Date()));
    const [repeatDays, setRepeatDays] = useState<number[]>([]);
    const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0, 5));
    const [dueTime, setDueTime] = useState('');
    const [weightLabel, setWeightLabel] = useState('mudah');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { shouldRender, animateIn, contentRef } = useModalTransition(isOpen, { enabled: mobileSheet });

    const primaryClass = accent === 'blue' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-primary hover:bg-purple-700 shadow-purple-200';
    const focusClass = accent === 'blue' ? 'focus:ring-blue-500' : 'focus:ring-primary';
    const minDate = toDateInputValue(new Date());
    const maxDate = toDateInputValue(getTaskWindowEndDate());

    useEffect(() => {
        const modalKey = initialBatch?.id ? `edit:${initialBatch.id}` : `create:${defaultDate || ''}`;
        if (!isOpen) {
            initializedKeyRef.current = null;
            return;
        }
        if (initializedKeyRef.current === modalKey) return;
        initializedKeyRef.current = modalKey;

        const fallbackDate = defaultDate || toDateInputValue(new Date());
        if (initialBatch) {
            setTitle(initialBatch.title || '');
            setWorkStationId(initialBatch.work_station_id ? String(initialBatch.work_station_id) : '');
            setStartDate(toDateFieldValue(initialBatch.start_date, fallbackDate));
            setEndDate(toDateFieldValue(initialBatch.end_date, fallbackDate));
            setRepeatDays(Array.isArray(initialBatch.repeat_days) ? initialBatch.repeat_days.map((day: any) => Number(day)) : []);
            setStartTime(toTimeFieldValue(initialBatch.start_time, new Date().toTimeString().slice(0, 5)));
            setDueTime(toTimeFieldValue(initialBatch.due_time));
            setWeightLabel(initialBatch.weight_label || 'mudah');
            setNote(initialBatch.description || '');
            setSelectedCrewIds(Array.isArray(initialBatch.crew_ids) ? initialBatch.crew_ids.map((id: any) => String(id)) : []);
        } else {
            setStartDate(fallbackDate);
            setEndDate(fallbackDate);
            setStartTime(new Date().toTimeString().slice(0, 5));
        }
    }, [isOpen, defaultDate, initialBatch]);

    useEffect(() => {
        if (!isOpen) return;

        if (crews) setCrewOptions(crews);

        const fetchSupportData = async () => {
            const token = localStorage.getItem('auth_token');
            const workStationResponse = await fetch('/api/work-stations', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (workStationResponse.ok) setWorkStations(await workStationResponse.json());

            if (!crews) {
                const crewResponse = await fetch('/api/supervisor/crews', {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                });
                if (crewResponse.ok) {
                    const data = await crewResponse.json();
                    setCrewOptions((data.crews || []).map((crew: any) => ({ id: crew.id, name: crew.name })));
                }
            }
        };

        fetchSupportData().catch((error) => console.error('Gagal mengambil data Bulk Assignment', error));
    }, [isOpen, crews]);

    if (!shouldRender) return null;

    const closeModal = (event?: React.SyntheticEvent) => {
        event?.preventDefault();
        event?.stopPropagation();
        initializedKeyRef.current = null;
        onClose();
    };

    const toggleCrew = (crewId: string) => {
        setSelectedCrewIds((current) => current.includes(crewId) ? current.filter((id) => id !== crewId) : [...current, crewId]);
    };

    const toggleRepeatDay = (day: number) => {
        setRepeatDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
    };

    const reset = () => {
        setTitle('');
        setWorkStationId('');
        setSelectedCrewIds([]);
        setRepeatDays([]);
        setDueTime('');
        setWeightLabel('mudah');
        setNote('');
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const startDateObject = new Date(`${startDate}T00:00:00`);
        const endDateObject = new Date(`${endDate}T00:00:00`);
        const now = new Date();
        let effectiveStartTime = startTime;
        let startAt = new Date(`${startDate}T${effectiveStartTime}:00`);
        const dueAt = new Date(`${startDate}T${dueTime}:00`);

        if (!initialBatch && startDate === toDateInputValue(now) && startAt < now) {
            effectiveStartTime = now.toTimeString().slice(0, 5);
            startAt = new Date(`${startDate}T${effectiveStartTime}:00`);
            setStartTime(effectiveStartTime);
        }

        if (selectedCrewIds.length === 0) return alert('Pilih minimal satu karyawan.');
        if (isBeforeToday(startDateObject) || isAfterTaskWindow(endDateObject)) return alert('Tanggal pekerjaan di luar periode penugasan.');
        if (endDateObject < startDateObject) return alert('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.');
        if (dueAt < startAt) return alert('Jam tenggat tidak boleh lebih awal dari jam mulai.');

        setSubmitting(true);
        try {
            await onSubmit({
                crew_ids: selectedCrewIds,
                title,
                work_station_id: workStationId || null,
                start_date: startDate,
                end_date: endDate,
                repeat_days: repeatDays,
                start_time: effectiveStartTime,
                due_time: dueTime,
                weight_label: weightLabel,
                note,
            });
            reset();
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div
            className={`fixed inset-0 z-[30000] flex justify-center transition-colors duration-300 ${mobileSheet
                ? `items-end p-0 sm:items-center sm:p-4 ${animateIn ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/0 pointer-events-none'}`
                : 'items-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4'
                }`}
            onClick={(event) => {
                if (event.target === event.currentTarget) closeModal(event);
            }}
        >
            <div
                ref={contentRef}
                className={`relative w-full max-w-3xl overflow-y-auto overscroll-contain bg-white p-6 shadow-2xl ${mobileSheet
                    ? `rounded-t-3xl sm:rounded-3xl transition-all duration-300 ease-out transform ${animateIn ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-full opacity-0 sm:translate-y-10 sm:scale-95'}`
                    : 'rounded-3xl'
                    }`}
                style={{ maxHeight: mobileSheet ? '100dvh' : 'calc(100vh - 2rem)' }}
                onClick={(event) => event.stopPropagation()}
            >
                {mobileSheet && <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 sm:hidden" />}
                <button type="button" aria-label="Tutup modal" onClick={closeModal} className="absolute top-4 right-4 z-50 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-600">
                    <X size={20} />
                </button>

                <h2 className="text-xl font-black text-gray-900 mb-1">{initialBatch ? 'Edit Bulk Assignment' : 'Bulk Assignment'}</h2>
                <p className="text-xs text-gray-500 mb-5">{initialBatch ? 'Perbarui pengaturan Bulk Assignment yang belum berjalan.' : 'Buat pekerjaan untuk beberapa karyawan dan beberapa hari sekaligus.'}</p>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="space-y-4">
                        <input className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 ${focusClass} outline-none`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul pekerjaan" required />

                        <select className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 ${focusClass} outline-none capitalize`} value={workStationId} onChange={(e) => setWorkStationId(e.target.value)}>
                            <option value="">Umum (lintas work station)</option>
                            {workStations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
                        </select>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">Tanggal mulai</label>
                                <div className="relative">
                                    <input type="date" value={startDate} min={minDate} max={maxDate} onChange={(e) => setStartDate(e.target.value)} className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 ${focusClass} outline-none`} required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">Tanggal berakhir</label>
                                <div className="relative">
                                    <input type="date" value={endDate} min={startDate || minDate} max={maxDate} onChange={(e) => setEndDate(e.target.value)} className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 ${focusClass} outline-none`} required />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">Jam mulai</label>
                                <div className="relative">
                                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 ${focusClass} outline-none`} required />
                                    <Clock size={16} className="absolute right-4 top-4 text-gray-400" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">Tenggat</label>
                                <div className="relative">
                                    <input type="time" value={dueTime} min={startTime} onChange={(e) => setDueTime(e.target.value)} className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 ${focusClass} outline-none`} required />
                                    <Clock size={16} className="absolute right-4 top-4 text-gray-400" />
                                </div>
                            </div>
                        </div>

                        <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">Bobot pekerjaan</label>
                        <select className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 ${focusClass} outline-none`} value={weightLabel} onChange={(e) => setWeightLabel(e.target.value)} required>
                            <option value="mudah">Mudah (2)</option>
                            <option value="menengah">Menengah (6)</option>
                            <option value="sulit">Sulit (10)</option>
                        </select>

                        <textarea className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 ${focusClass} outline-none resize-none`} rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Deskripsi pekerjaan" />
                    </div>

                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-bold text-gray-600 mb-2">Hari Pengulangan</p>
                            <div className="grid grid-cols-7 gap-2">
                                {dayOptions.map((day) => (
                                    <button key={day.value} type="button" onClick={() => toggleRepeatDay(day.value)} className={`rounded-xl py-2 text-xs font-bold ${repeatDays.includes(day.value) ? 'bg-primary text-white' : 'bg-gray-50 text-gray-500'}`}>
                                        {day.label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1 text-[10px] text-gray-400">Kosongkan jika pekerjaan dibuat setiap hari dalam rentang tanggal.</p>
                        </div>

                        <div className="rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                                <p className="text-xs font-black text-gray-700">Pilih Karyawan</p>
                                <button type="button" className="text-xs font-bold text-primary" onClick={() => setSelectedCrewIds(crewOptions.map((crew) => crew.id))}>Pilih Semua</button>
                            </div>
                            <div className="max-h-72 overflow-y-auto p-2 space-y-2">
                                {crewOptions.map((crew) => (
                                    <button key={crew.id} type="button" onClick={() => toggleCrew(crew.id)} className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${selectedCrewIds.includes(crew.id) ? 'border-primary bg-purple-50 text-primary font-bold' : 'border-gray-100 hover:bg-gray-50'}`}>
                                        <span>{crew.name}</span>
                                        {selectedCrewIds.includes(crew.id) && <Check size={16} />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button disabled={submitting} type="submit" className={`w-full rounded-2xl py-4 text-white font-black shadow-lg ${primaryClass} disabled:opacity-60`}>
                            {submitting ? 'Menyimpan...' : submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
