import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Calendar, User, ChevronLeft, ChevronRight } from 'lucide-react';

interface MobileTaskPreviewProps {
    task: any;
    isOpen: boolean;
    onClose: () => void;
    activeTab: 'before' | 'after';
    onTabChange: (tab: 'before' | 'after') => void;
    initialIndex?: number;
    onDeleteProof?: (evidenceId: number) => void;
    onUpdateStatus?: (status: string) => void;
    showHistoryLabel?: boolean;
    readOnly?: boolean;
}

export default function MobileTaskPreview({ task, isOpen, onClose, activeTab, onTabChange, initialIndex = 0, onDeleteProof, onUpdateStatus, showHistoryLabel = false, readOnly = false }: MobileTaskPreviewProps) {
    const [animateIn, setAnimateIn] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        if (isOpen) {
            setAnimateIn(true);
            setSelectedIndex(initialIndex);
        } else {
            setAnimateIn(false);
        }
    }, [isOpen, initialIndex]);

    const handleClose = () => {
        setAnimateIn(false);
        setTimeout(onClose, 300);
    };

    const getFullUrl = (url?: string | null) => {
        if (!url || url === 'null') return null;
        if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('/storage/')) return url;
        return `/storage/${url}`;
    };

    const currentEvidences = (task?.evidences || []).filter((e: any) => e.type === activeTab);
    const safeIndex = selectedIndex >= currentEvidences.length ? Math.max(0, currentEvidences.length - 1) : selectedIndex;
    const currentEvidence = currentEvidences[safeIndex];
    const currentImage = currentEvidence ? getFullUrl(currentEvidence.file_path) : null;

    // Smart close when the last image of this tab is deleted
    useEffect(() => {
        if (isOpen && currentEvidences.length === 0) {
            handleClose();
        }
    }, [currentEvidences.length, isOpen]);

    if (!isOpen || !task) return null;

    return createPortal(
        <div className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-colors duration-300 ${animateIn ? 'bg-black/80 backdrop-blur-sm' : 'bg-black/0 pointer-events-none'}`}>
            {/* Modal Content */}
            <div
                className={`bg-gray-100 w-full max-w-sm rounded-[30px] overflow-hidden shadow-2xl relative transition-all duration-300 ease-out transform ${animateIn ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-5'
                    }`}
            >
                {/* Header Image Area */}
                <div className="relative w-full aspect-[3/4] bg-gray-900 group">
                    {currentImage ? (
                        <img
                            src={currentImage}
                            alt={activeTab}
                            className="w-full h-full object-cover transition-opacity duration-300"
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                            <span className="text-4xl mb-4">📷</span>
                            <p className="text-sm font-medium">No Image</p>
                        </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

                    {/* Top Bar */}
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10">
                        <button
                            onClick={handleClose}
                            className="bg-black/20 hover:bg-black/40 backdrop-blur-md text-white p-2 rounded-full transition shadow-sm"
                        >
                            <X size={20} />
                        </button>

                        {showHistoryLabel ? (
                            <span className="bg-blue-600/90 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                                HISTORY
                            </span>
                        ) : (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-md backdrop-blur-md ${readOnly ? 'bg-gray-500/80' : 'bg-blue-500/80'}`}>
                                {readOnly ? 'READ ONLY' : 'REVIEW'}
                            </span>
                        )}
                    </div>

                    {/* Navigation Arrows for Multiple Images within Tab */}
                    {currentEvidences.length > 1 && (
                        <div className="absolute top-1/2 left-0 right-0 flex justify-between px-2 -translate-y-1/2 z-20">
                            <button
                                onClick={() => setSelectedIndex(prev => Math.max(0, prev - 1))}
                                disabled={safeIndex === 0}
                                className="p-2 rounded-full backdrop-blur-md transition bg-black/30 hover:bg-black/50 text-white disabled:opacity-30 shadow-sm"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <button
                                onClick={() => setSelectedIndex(prev => Math.min(currentEvidences.length - 1, prev + 1))}
                                disabled={safeIndex === currentEvidences.length - 1}
                                className="p-2 rounded-full backdrop-blur-md transition bg-black/30 hover:bg-black/50 text-white disabled:opacity-30 shadow-sm"
                            >
                                <ChevronRight size={24} />
                            </button>
                        </div>
                    )}

                    {/* Indicator Dots */}
                    {currentEvidences.length > 1 && (
                        <div className="absolute bottom-[90px] left-0 right-0 flex justify-center gap-1.5 z-20">
                            {currentEvidences.map((_: any, idx: number) => (
                                <div key={idx} className={`h-1.5 rounded-full transition-all ${idx === safeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}></div>
                            ))}
                        </div>
                    )}

                    {/* Bottom Info inside Image */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white z-10">
                        <h2 className="text-xl font-bold leading-tight mb-1">{task.title}</h2>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-white/80 text-xs">
                                <span className="flex items-center gap-1">
                                    <Calendar size={12} />
                                    {new Date(currentEvidence?.created_at || task.due_at || Date.now()).toLocaleDateString()}
                                </span>
                                <span className="flex items-center gap-1">
                                    <User size={12} />
                                    Crew Upload
                                </span>
                            </div>
                            {/* Tab Switcher Button (Small) */}
                            <button
                                onClick={() => {
                                    setSelectedIndex(0);
                                    onTabChange(activeTab === 'before' ? 'after' : 'before');
                                }}
                                className="bg-white/20 text-xs px-2 py-1 rounded-full hover:bg-white/30 transition shadow-sm border border-white/20">
                                Go to {activeTab === 'before' ? 'After' : 'Before'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer / Actions */}
                <div className="p-5 bg-white flex flex-col gap-3">
                    <p className="text-xs text-center text-gray-500 font-medium mb-1 tracking-wider uppercase">
                        {activeTab === 'before' ? 'Before Work' : 'After Work'} Evidence {currentEvidences.length > 1 ? `(${safeIndex + 1}/${currentEvidences.length})` : ''}
                    </p>

                    {(!readOnly && onDeleteProof && currentEvidence?.id) ? (
                        <button
                            onClick={() => {
                                if (window.confirm('Delete this image?')) {
                                    onDeleteProof(currentEvidence.id!);
                                    if (currentEvidences.length <= 1) {
                                        handleClose(); // Instant smooth animation
                                    } else {
                                        setSelectedIndex(prev => Math.max(0, prev - 1));
                                    }
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
