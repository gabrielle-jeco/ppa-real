import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';

interface MobileAddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (task: any) => void;
    defaultDate?: string;
}

export default function MobileAddTaskModal({ isOpen, onClose, onSubmit, defaultDate }: MobileAddTaskModalProps) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(defaultDate || '');
    const [time, setTime] = useState('');
    const [note, setNote] = useState('');
    const [animateIn, setAnimateIn] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAnimateIn(true);
            if (defaultDate) setDate(defaultDate);
        } else {
            setAnimateIn(false);
        }
    }, [isOpen, defaultDate]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const dueAt = `${date} ${time}:00`;
        onSubmit({ title, due_at: dueAt, note });
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
                    <h2 className="text-xl font-bold text-gray-800">New Task</h2>
                    <button
                        onClick={handleClose}
                        className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Task Title */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Title</label>
                        <input
                            type="text"
                            placeholder="e.g. Cek Kebersihan"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-5 py-4 text-gray-800 font-medium transition-all"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Date Picker */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Date</label>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    max={new Date().toLocaleDateString('en-CA')}
                                    className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-4 py-4 text-sm text-gray-700 font-medium transition-all"
                                    required
                                />
                            </div>
                        </div>

                        {/* Time Picker */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Time</label>
                            <div className="relative">
                                <input
                                    type="time"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                    className="w-full bg-gray-50 border-transparent focus:border-blue-500 focus:bg-white focus:ring-0 rounded-2xl px-4 py-4 text-sm text-gray-700 font-medium transition-all"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Note Input */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Note (Optional)</label>
                        <textarea
                            placeholder="Add details..."
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
                            Create Task
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
