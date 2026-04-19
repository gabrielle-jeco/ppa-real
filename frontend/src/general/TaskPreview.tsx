import React, { useState, useEffect } from 'react';
import { Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface TaskPreviewProps {
    task: any;
    onClose: () => void;
    onDeleteProof?: (evidenceId: number) => void;
    readOnly?: boolean;
}

export default function TaskPreview({ task, onClose, onDeleteProof, readOnly = false }: TaskPreviewProps) {
    const [activeTab, setActiveTab] = useState<'before' | 'after'>('before');
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        setSelectedIndex(0);
    }, [activeTab, task?.evidences?.length]);

    if (!task) return null;

    const getFullUrl = (url?: string | null) => {
        if (!url) return null;
        return url.startsWith('http') || url.startsWith('blob:') || url.startsWith('/storage/') ? url : `/storage/${url}`;
    };

    const currentEvidences = (task.evidences || []).filter((e: any) => e.type === activeTab);

    // Ensure index is within bounds if an item is deleted
    const safeIndex = selectedIndex >= currentEvidences.length ? Math.max(0, currentEvidences.length - 1) : selectedIndex;
    const currentEvidence = currentEvidences[safeIndex];
    const currentImage = currentEvidence ? getFullUrl(currentEvidence.file_path) : null;

    return (
        <div className="flex flex-col h-full relative">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="font-bold text-gray-800 text-lg">Task Proof</h2>
                    <p className="text-sm text-gray-400">{task.title}</p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition">
                    <X size={20} className="text-gray-500" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                <button onClick={() => setActiveTab('before')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${activeTab === 'before' ? 'bg-primary text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Before Work</button>
                <button onClick={() => setActiveTab('after')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${activeTab === 'after' ? 'bg-primary text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>After Work</button>
            </div>

            {/* Main Preview (Gray Box) */}
            <div className="flex-1 bg-gray-200 rounded-2xl mb-4 flex items-center justify-center relative overflow-hidden shadow-inner group">
                {currentImage ? (
                    <>
                        <img src={currentImage} alt="Proof" className="w-full h-full object-contain" />

                        {/* Navigation Arrows for Multiple Images */}
                        {currentEvidences.length > 1 && (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedIndex(prev => Math.max(0, prev - 1)); }}
                                    disabled={safeIndex === 0}
                                    className="absolute left-2 p-2 bg-black/30 hover:bg-black/50 disabled:opacity-30 text-white rounded-full transition"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedIndex(prev => Math.min(currentEvidences.length - 1, prev + 1)); }}
                                    disabled={safeIndex === currentEvidences.length - 1}
                                    className="absolute right-2 p-2 bg-black/30 hover:bg-black/50 disabled:opacity-30 text-white rounded-full transition"
                                >
                                    <ChevronRight size={20} />
                                </button>
                                <div className="absolute bottom-3 bg-black/50 px-3 py-1 rounded-full text-white text-xs font-bold shadow items-center gap-1">
                                    {safeIndex + 1} / {currentEvidences.length}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-400 text-sm">
                        <span className="text-4xl mb-2">📷</span>
                        No images uploaded.
                    </div>
                )}
            </div>

            {/* Thumbnails Strip */}
            {currentEvidences.length > 1 && (
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2 px-1 snap-x">
                    {currentEvidences.map((evidence: any, idx: number) => (
                        <button
                            key={evidence.id}
                            onClick={() => setSelectedIndex(idx)}
                            className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition snap-center ${idx === safeIndex ? 'border-primary shadow-md opacity-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
                        >
                            <img src={getFullUrl(evidence.file_path)!} alt="Thumb" className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            )}

            {/* Action Buttons */}
            {(!readOnly && onDeleteProof && currentEvidence) && (
                <div>
                    <button
                        onClick={() => {
                            if (window.confirm('Delete this image?')) {
                                onDeleteProof(currentEvidence.id);
                            }
                        }}
                        className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-500 hover:bg-red-100 font-bold py-3 px-4 rounded-xl transition"
                    >
                        <Trash2 size={16} />
                        Delete Evidence
                    </button>
                </div>
            )}
        </div>
    );
}
