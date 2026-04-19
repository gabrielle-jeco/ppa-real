import React, { useState } from 'react';
import { Calendar, Clock, X } from 'lucide-react';

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (task: any) => void;
    defaultDate?: string; // YYYY-MM-DD
}

export default function AddTaskModal({ isOpen, onClose, onSubmit, defaultDate }: AddTaskModalProps) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(defaultDate || '');
    const [time, setTime] = useState('');
    const [note, setNote] = useState('');

    // Reset/Update date when defaultDate changes or modal opens
    React.useEffect(() => {
        if (isOpen && defaultDate) {
            setDate(defaultDate);
        }
    }, [isOpen, defaultDate]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Combine date and time
        const dueAt = `${date} ${time}:00`;
        onSubmit({
            title,
            due_at: dueAt,
            note,
        });
        onClose();
        // Reset form
        setTitle('');
        setDate('');
        setTime('');
        setNote('');
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

                <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Task Deadline</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Task Title (MVP Addition) */}
                    <div>
                        <input
                            type="text"
                            placeholder="Task Title (e.g. Cek Kebersihan)"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-primary outline-none shadow-inner"
                            required
                        />
                    </div>

                    {/* Date Picker */}
                    <div className="relative">
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
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
                            className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 focus:ring-2 focus:ring-primary outline-none shadow-sm cursor-pointer"
                            required
                        />
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-purple-600">
                            <Clock size={20} />
                        </div>
                    </div>

                    {/* Note Input */}
                    <div>
                        <input
                            type="text"
                            placeholder="Input Note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-primary outline-none shadow-sm"
                        />
                    </div>



                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            className="bg-primary text-white font-bold py-3 px-8 rounded-full hover:bg-purple-700 transition shadow-lg w-full md:w-auto"
                        >
                            Done
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
