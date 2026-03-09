import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Calendar, User, ChevronLeft, ChevronRight } from 'lucide-react';

interface MobileTaskPreviewProps {
    task: any;
    isOpen: boolean;
    onClose: () => void;
    onDeleteProof?: (taskId: number, type: 'before' | 'after') => void;
    onUpdateStatus?: (status: string) => void;
    showHistoryLabel?: boolean;
    readOnly?: boolean;
}

export default function MobileTaskPreview({ task, isOpen, onClose, onDeleteProof, onUpdateStatus, showHistoryLabel = false, readOnly = false }: MobileTaskPreviewProps) {
    const [animateIn, setAnimateIn] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (isOpen) {
            setAnimateIn(true);
            setCurrentIndex(0); // Reset to first image on open
        } else {
            setAnimateIn(false);
        }
    }, [isOpen]);

    if (!isOpen || !task) return null;

    const handleClose = () => {
        setAnimateIn(false);
        setTimeout(onClose, 300);
    };

    // Collect available images
    const getFullUrl = (url: string) => {
        if (!url || url === 'null') return null;
        if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('/storage/')) return url;
        return `/storage/${url}`;
    };

    const images: { type: string; url: string; backendType: 'before' | 'after' }[] = [];
    const beforeFull = getFullUrl(task.before_image);
    const afterFull = getFullUrl(task.after_image);
    const proofFull = getFullUrl(task.proof_image); // Keeping for legacy safety

    if (beforeFull) images.push({ type: 'Before Work', url: beforeFull, backendType: 'before' });
    if (afterFull) images.push({ type: 'After Work', url: afterFull, backendType: 'after' });
    if (proofFull && !afterFull) images.push({ type: 'Proof', url: proofFull, backendType: 'after' }); // fallback for legacy proof_image

    const currentImage = images.length > 0 ? images[currentIndex] : null;

    const nextImage = () => {
        if (images.length > 1) {
            setCurrentIndex((prev) => (prev + 1) % images.length);
        }
    };

    const prevImage = () => {
        if (images.length > 1) {
            setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
        }
    };

    return createPortal(
        <div className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-colors duration-300 ${animateIn ? 'bg-black/80 backdrop-blur-sm' : 'bg-black/0 pointer-events-none'}`}>
            {/* Modal Content */}
            <div
                className={`bg-white w-full max-w-sm rounded-[30px] overflow-hidden shadow-2xl relative transition-all duration-300 ease-out transform ${animateIn ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-10'
                    }`}
            >
                {/* Header Image Area */}
                <div className="relative w-full aspect-[3/4] bg-gray-900 group">
                    {currentImage ? (
                        <img
                            src={currentImage.url}
                            alt={currentImage.type}
                            className="w-full h-full object-cover transition-opacity duration-300"
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-100">
                            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                                <span className="text-2xl">📷</span>
                            </div>
                            <p className="text-sm font-medium">No Image Uploaded</p>
                        </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none"></div>

                    {/* Navbar inside Image */}
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10">
                        <button
                            onClick={handleClose}
                            className="bg-black/20 hover:bg-black/40 backdrop-blur-md text-white p-2 rounded-full transition"
                        >
                            <X size={20} />
                        </button>

                        {showHistoryLabel ? (
                            <span className="bg-blue-600/90 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                                HISTORY
                            </span>
                        ) : (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-lg backdrop-blur-md ${task.status === 'approved' ? 'bg-green-500/80' : 'bg-blue-500/80'}`}>
                                {task.status}
                            </span>
                        )}
                    </div>

                    {/* Carousel Arrows */}
                    {images.length > 1 && (
                        <div className="absolute top-1/2 left-0 right-0 flex justify-between px-2 -translate-y-1/2 z-20">
                            <button
                                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                                className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white transition"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                                className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white transition"
                            >
                                <ChevronRight size={24} />
                            </button>
                        </div>
                    )}

                    {/* Bottom Info inside Image */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white z-10">
                        <h2 className="text-xl font-bold leading-tight mb-1">{task.title}</h2>
                        <div className="flex items-center gap-3 text-white/80 text-xs">
                            <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                {new Date(task.updated_at || new Date()).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                                <User size={12} />
                                Uploaded by Crew
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer / Actions */}
                <div className="p-5 bg-white flex flex-col gap-3">
                    {currentImage ? (
                        <p className="text-xs text-gray-500 text-center mb-1">{currentImage.type} Evidence</p>
                    ) : (
                        <p className="text-center w-full text-gray-400 text-sm py-2">
                            Task pending or no visual proof required.
                        </p>
                    )}

                    {(!readOnly && onDeleteProof && currentImage) ? (
                        <button
                            onClick={() => {
                                if (window.confirm('Delete this image?')) {
                                    onDeleteProof(task.task_id, currentImage.backendType);
                                    handleClose();
                                }
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-500 hover:bg-red-100 font-bold py-3 px-4 rounded-xl transition"
                        >
                            <Trash2 size={16} />
                            Delete Image
                        </button>
                    ) : (
                        <div className="py-3 px-4 rounded-xl bg-gray-50 text-gray-400 text-center text-sm font-medium mt-2">
                            Evidence View Only
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
