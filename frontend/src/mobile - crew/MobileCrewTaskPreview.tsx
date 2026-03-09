import React, { useEffect, useState } from 'react';
import { X, Trash2, Calendar, User, ChevronLeft, ChevronRight } from 'lucide-react';

interface MobileCrewTaskPreviewProps {
    task: any;
    isOpen: boolean;
    onClose: () => void;
    activeTab: 'before' | 'after';
    onTabChange: (tab: 'before' | 'after') => void;
    beforeImage: string | null;
    afterImage: string | null;
    onDelete: (type: 'before' | 'after') => void;
    readOnly?: boolean;
}

export default function MobileCrewTaskPreview({
    task,
    isOpen,
    onClose,
    activeTab,
    onTabChange,
    beforeImage,
    afterImage,
    onDelete,
    readOnly = false
}: MobileCrewTaskPreviewProps) {
    const [animateIn, setAnimateIn] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAnimateIn(true);
        } else {
            setAnimateIn(false);
        }
    }, [isOpen]);

    if (!isOpen && !animateIn) return null;

    const handleClose = () => {
        setAnimateIn(false);
        setTimeout(onClose, 300);
    };

    const currentImage = activeTab === 'before' ? beforeImage : afterImage;

    return (
        <div className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-colors duration-300 ${animateIn ? 'bg-black/90 backdrop-blur-sm' : 'bg-black/0 pointer-events-none'}`}>
            <div className={`bg-white w-full max-w-sm rounded-[30px] overflow-hidden shadow-2xl relative transition-all duration-300 ease-out transform ${animateIn ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-5'}`}>
                {/* Header Image Area */}
                <div className="relative w-full aspect-[3/4] bg-gray-900 group">
                    {currentImage ? (
                        <img src={currentImage} alt={activeTab} className="w-full h-full object-cover transition-opacity duration-300" />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-100">
                            <span className="text-4xl mb-4">📷</span>
                            <p className="text-sm font-medium">No Image</p>
                        </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none"></div>

                    {/* Top Bar */}
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10">
                        <button onClick={handleClose} className="bg-black/20 hover:bg-black/40 backdrop-blur-md text-white p-2 rounded-full transition">
                            <X size={20} />
                        </button>
                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-lg backdrop-blur-md ${readOnly ? 'bg-gray-500/80' : (task.status === 'approved' ? 'bg-green-500/80' : 'bg-blue-500/80')}`}>
                            {readOnly ? 'READ ONLY' : task.status}
                        </span>
                    </div>

                    {/* Tabs (Clean Arrows only) */}
                    <div className="absolute top-1/2 left-0 right-0 flex justify-between px-2 -translate-y-1/2 z-20">
                        <button onClick={() => onTabChange('before')} className={`p-2 rounded-full backdrop-blur-md transition ${activeTab === 'before' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'}`}>
                            <ChevronLeft size={24} />
                        </button>
                        <button onClick={() => onTabChange('after')} className={`p-2 rounded-full backdrop-blur-md transition ${activeTab === 'after' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'}`}>
                            <ChevronRight size={24} />
                        </button>
                    </div>

                    {/* Bottom Info on Image */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white z-10">
                        <h2 className="text-xl font-bold leading-tight mb-1">{task.title}</h2>
                        <div className="flex items-center gap-3 text-white/80 text-xs">
                            <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                {new Date(task.due_at || Date.now()).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                                <User size={12} />
                                Crew Upload
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer - Matching Supervisor Actions */}
                <div className="p-5 bg-white flex items-center justify-between gap-4">
                    {currentImage ? (
                        <div className="flex-1">
                            <p className="text-xs text-gray-500 mb-1">{activeTab === 'before' ? 'Before Work' : 'After Work'} Evidence</p>
                            {!readOnly ? (
                                <button
                                    onClick={() => {
                                        if (window.confirm(`Delete ${activeTab} image?`)) {
                                            onDelete(activeTab);
                                            handleClose();
                                        }
                                    }}
                                    className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-500 hover:bg-red-100 font-bold py-3 px-4 rounded-xl transition"
                                >
                                    <Trash2 size={18} />
                                    Delete Image
                                </button>
                            ) : (
                                <div className="py-3 px-4 rounded-xl bg-gray-50 text-gray-400 text-center text-sm font-medium">
                                    Read Only Mode
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-center w-full text-gray-400 text-sm py-2">
                            No image uploaded for this section.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
