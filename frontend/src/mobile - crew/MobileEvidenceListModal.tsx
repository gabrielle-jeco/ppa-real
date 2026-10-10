import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, ChevronRight, Calendar } from 'lucide-react';
import TaskStartStatus from '../general/TaskStartStatus';

interface MobileEvidenceListModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: any;
    onSelectImage: (imageType: 'before' | 'after' | 'proof', index?: number) => void;
    onDelete?: (evidenceId: number) => void; // Optional delete capability
    readOnly?: boolean;
}

export default function MobileEvidenceListModal({
    isOpen,
    onClose,
    task,
    onSelectImage
}: MobileEvidenceListModalProps) {
    const [animateIn, setAnimateIn] = useState(false);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => setAnimateIn(isOpen));
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen]);

    if (!isOpen && !animateIn) return null;

    const handleClose = () => {
        setAnimateIn(false);
        setTimeout(onClose, 300);
    };

    // Helper to render list item
    const renderItem = (evidence: any, type: 'before' | 'after' | 'proof', label: string, index: number) => {
        if (!evidence?.file_path) return null;

        // Ensure full URL
        const getFullUrl = (url: string) => {
            if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('/storage/')) return url;
            return `/storage/${url}`;
        };
        const fullUrl = getFullUrl(evidence.file_path);
        const reviewLabel = evidence.review_status === 'approved'
            ? 'Disetujui'
            : evidence.review_status === 'rejected'
                ? 'Ditolak'
                : evidence.review_status === 'pending'
                    ? 'Menunggu'
                    : null;

        return (
            <div
                key={evidence.id || fullUrl}
                className="overflow-hidden bg-gray-100 rounded-2xl p-3 transition-transform active:scale-[0.98] mb-3 shadow-sm"
            >
                <div className="flex min-w-0 items-center justify-between">
                    <div
                        className="flex min-w-0 items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => onSelectImage(type, index)}
                    >
                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded-xl bg-gray-600 overflow-hidden shrink-0 shadow-md">
                            <img src={fullUrl} alt={label} className="w-full h-full object-cover opacity-90" />
                        </div>

                        {/* Text Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                                <p className="min-w-0 flex-1 font-bold text-gray-700 text-sm mb-0.5 truncate">{evidence.attempt_no ? `${label} - Attempt ${evidence.attempt_no}` : label}</p>
                                {reviewLabel && (
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${evidence.review_status === 'approved' ? 'bg-green-100 text-green-700' : evidence.review_status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {reviewLabel}
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                <Calendar size={10} />
                                {new Date(evidence.created_at || task.updated_at || new Date()).toLocaleString()}
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            onClick={() => onSelectImage(type, index)}
                            className="p-2 text-gray-400 hover:text-blue-600 rounded-full transition"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
                {evidence.rejection_reason && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700">Catatan: {evidence.rejection_reason}</p>}
            </div>
        );
    };

    const beforeEvidences = task?.evidences?.filter((e: any) => e.type === 'before') || [];
    const afterEvidences = task?.evidences?.filter((e: any) => e.type === 'after') || [];
    const hasImages = beforeEvidences.length > 0 || afterEvidences.length > 0;

    return createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-colors duration-300 ${animateIn ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/0 pointer-events-none'}`}>
            {/* Modal Content */}
            <div
                className={`bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl relative transition-all duration-300 ease-out transform ${animateIn ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-10'}`}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Daftar Bukti</h2>
                        <p className="text-sm text-gray-500 mt-0.5">{task?.title || 'Pekerjaan'}</p>
                        <TaskStartStatus
                            task={task}
                            scheduleClassName="text-xs text-gray-400 mt-1"
                            statusClassName="text-xs text-amber-500 font-semibold"
                        />
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* List Content */}
                <div className="min-h-[150px]">
                    {!hasImages ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
                            <ImageIcon size={32} className="mb-2 opacity-50" />
                            <p className="text-sm">Belum ada bukti yang diunggah.</p>
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-[60vh] overflow-x-hidden overflow-y-auto pr-2">
                            {/* Crew Task Images */}
                            {beforeEvidences.length > 0 && (
                                <div>
                                    <h3 className="text-gray-800 font-bold text-sm mb-2 ml-1">Sebelum</h3>
                                    {beforeEvidences.map((e: any, idx: number) =>
                                        renderItem(e, 'before', `Sebelum Bekerja ${beforeEvidences.length > 1 ? `#${idx + 1}` : ''}`, idx)
                                    )}
                                </div>
                            )}
                            {afterEvidences.length > 0 && (
                                <div>
                                    <h3 className="text-gray-800 font-bold text-sm mb-2 ml-1">Sesudah</h3>
                                    {afterEvidences.map((e: any, idx: number) =>
                                        renderItem(e, 'after', `Sesudah Bekerja ${afterEvidences.length > 1 ? `#${idx + 1}` : ''}`, idx)
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-8">
                    <button
                        onClick={handleClose}
                        className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-full shadow-lg active:scale-95 transition-transform"
                    >
                        Kembali
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
