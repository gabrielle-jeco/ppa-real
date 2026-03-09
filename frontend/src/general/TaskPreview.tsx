import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';

interface TaskPreviewProps {
    task: any;
    onClose: () => void;
    onDeleteProof?: (taskId: number, type: 'before' | 'after') => void;
    readOnly?: boolean;
}

export default function TaskPreview({ task, onClose, onDeleteProof, readOnly = false }: TaskPreviewProps) {
    const [activeTab, setActiveTab] = useState<'before' | 'after'>('before');

    if (!task) return null;

    const getFullUrl = (url?: string | null) => {
        if (!url) return null;
        return url.startsWith('http') || url.startsWith('blob:') || url.startsWith('/storage/') ? url : `/storage/${url}`;
    };

    const beforeFull = getFullUrl(task.before_image);
    const afterFull = getFullUrl(task.after_image);
    const currentImage = activeTab === 'before' ? beforeFull : afterFull;

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
            <div className="flex-1 bg-gray-200 rounded-2xl mb-4 flex items-center justify-center relative overflow-hidden shadow-inner">
                {currentImage ? (
                    <img src={currentImage} alt="Proof" className="w-full h-full object-contain" />
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-400 text-sm">
                        <span className="text-4xl mb-2">📷</span>
                        No image uploaded.
                    </div>
                )}
            </div>

            {/* Information */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 flex items-center gap-3 shadow-sm mb-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {currentImage ? (
                        <img src={currentImage} alt="Thumb" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-xs text-gray-400">N/A</span>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-700 truncate">{activeTab === 'before' ? 'Before Evidence' : 'After Evidence'}</p>
                    <p className="text-xs text-gray-400">
                        {new Date(task.updated_at || new Date()).toLocaleString()}
                    </p>
                </div>
            </div>

            {/* Action Buttons */}
            {(!readOnly && onDeleteProof && currentImage) && (
                <div>
                    <button
                        onClick={() => {
                            if (window.confirm('Delete this image?')) {
                                onDeleteProof(task.task_id, activeTab);
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
