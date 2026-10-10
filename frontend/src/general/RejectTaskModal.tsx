import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

type RejectTaskModalProps = {
    task: any;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (note: string) => Promise<void>;
};

export default function RejectTaskModal({ task, isOpen, onClose, onSubmit }: RejectTaskModalProps) {
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setNote('');
            setError('');
        }
    }, [isOpen, task?.task_id]);

    if (!isOpen || !task) return null;

    const scoreAfterReject = task.review_summary?.score_after_reject ?? 0;
    const handleSubmit = async () => {
        const trimmedNote = note.trim();
        if (!trimmedNote) {
            setError('Catatan penolakan wajib diisi.');
            return;
        }

        setIsSubmitting(true);
        setError('');
        try {
            await onSubmit(trimmedNote);
            onClose();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Gagal menolak pekerjaan.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-500">Konfirmasi</p>
                        <h3 className="mt-1 text-xl font-bold text-gray-900">Tolak Pekerjaan</h3>
                    </div>
                    <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-full bg-gray-100 p-2 text-gray-500 hover:bg-gray-200">
                        <X size={18} />
                    </button>
                </div>

                <p className="text-sm leading-relaxed text-gray-600">
                    Apakah Anda yakin akan menolak pekerjaan <span className="font-semibold text-gray-900">{task.title}</span>?
                </p>
                <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Poin maksimal setelah reject: <span className="font-bold">{scoreAfterReject}%</span>
                </div>

                <label className="mt-5 block text-sm font-semibold text-gray-700" htmlFor="reject-note">
                    Catatan <span className="text-red-500">*</span>
                </label>
                <textarea
                    id="reject-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={1000}
                    rows={4}
                    disabled={isSubmitting}
                    className="mt-2 w-full resize-none rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    placeholder="Jelaskan bagian yang perlu diperbaiki..."
                />
                {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-60">
                        Kembali
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-100 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60">
                        {isSubmitting ? 'Mengirim...' : 'Submit'}
                    </button>
                </div>
            </div>
        </div>
    );
}
