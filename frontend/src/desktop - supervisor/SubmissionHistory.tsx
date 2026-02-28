import React from 'react';
import { Trash2, X } from 'lucide-react';

interface SubmissionHistoryProps {
    task: any;
    onClose: () => void;
}

export default function SubmissionHistory({ task, onClose }: SubmissionHistoryProps) {
    if (!task) return null;

    const getFullUrl = (url?: string | null) => {
        if (!url) return null;
        return url.startsWith('http') || url.startsWith('blob:') || url.startsWith('/storage/') ? url : `/storage/${url}`;
    };

    const beforeFull = getFullUrl(task.before_image);
    const afterFull = getFullUrl(task.after_image);

    return (
        <div className="flex flex-col h-full relative">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="font-bold text-gray-800 text-lg">Submission History</h2>
                    <p className="text-sm text-gray-400">{task.title}</p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition">
                    <X size={20} className="text-gray-500" />
                </button>
            </div>

            {/* Content Scroller */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-1">
                {/* Before Section */}
                <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400"></span> Before
                    </h3>

                    <div className="space-y-3">
                        {beforeFull ? (
                            <div className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 hover:shadow-md transition">
                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                    <img src={beforeFull} alt="Before" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-700 truncate">Before Evidence</p>
                                    <p className="text-[10px] text-gray-400">{new Date(task.updated_at).toLocaleString()}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-gray-400 italic">No submission yet.</div>
                        )}
                    </div>
                </div>

                {/* After Section */}
                <div>
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary"></span> After
                    </h3>

                    <div className="space-y-3">
                        {afterFull ? (
                            <div className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 hover:shadow-md transition">
                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                    <img src={afterFull} alt="After" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-700 truncate">After Evidence</p>
                                    <p className="text-[10px] text-gray-400">{new Date(task.updated_at).toLocaleString()}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-gray-400 italic">No submission yet.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
