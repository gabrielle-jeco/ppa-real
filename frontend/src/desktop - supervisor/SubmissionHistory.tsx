import React from 'react';
import { X } from 'lucide-react';
import TaskStartStatus from '../general/TaskStartStatus';

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

    const beforeEvidences = (task.evidences || []).filter((e: any) => e.type === 'before');
    const afterEvidences = (task.evidences || []).filter((e: any) => e.type === 'after');

    return (
        <div className="flex flex-col h-full relative">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="font-bold text-gray-800 text-lg">Riwayat Bukti</h2>
                    <p className="text-sm text-gray-400">{task.title}</p>
                    <TaskStartStatus
                        task={task}
                        scheduleClassName="text-xs text-gray-400 mt-1"
                        statusClassName="text-xs text-amber-500 font-semibold"
                    />
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
                        <span className="w-2 h-2 rounded-full bg-gray-400"></span> Sebelum
                    </h3>

                    <div className="space-y-3">
                        {beforeEvidences.length > 0 ? (
                            beforeEvidences.map((evidence: any, index: number) => (
                                <div key={evidence.id || index} className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 hover:shadow-md transition">
                                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                        <img src={getFullUrl(evidence.file_path)!} alt="Sebelum" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-gray-700 truncate">Bukti Sebelum {beforeEvidences.length > 1 ? `#${index + 1}` : ''}</p>
                                        <p className="text-[10px] text-gray-400">{new Date(evidence.created_at || task.updated_at).toLocaleString()}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-xs text-gray-400 italic">Belum ada bukti.</div>
                        )}
                    </div>
                </div>

                {/* After Section */}
                <div>
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary"></span> Sesudah
                    </h3>

                    <div className="space-y-3">
                        {afterEvidences.length > 0 ? (
                            afterEvidences.map((evidence: any, index: number) => (
                                <div key={evidence.id || index} className="rounded-xl border border-gray-100 bg-white p-3 hover:shadow-md transition">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                            <img src={getFullUrl(evidence.file_path)!} alt="Sesudah" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-medium text-gray-700 truncate">Bukti Sesudah {evidence.attempt_no ? `Attempt ${evidence.attempt_no}` : afterEvidences.length > 1 ? `#${index + 1}` : ''}</p>
                                                {evidence.review_status && (
                                                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${evidence.review_status === 'approved' ? 'bg-green-50 text-green-700' : evidence.review_status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                                                        {evidence.review_status === 'approved' ? 'Disetujui' : evidence.review_status === 'rejected' ? 'Ditolak' : 'Menunggu'}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-gray-400">{new Date(evidence.created_at || task.updated_at).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    {evidence.rejection_reason && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[10px] leading-relaxed text-red-700">Catatan: {evidence.rejection_reason}</p>}
                                </div>
                            ))
                        ) : (
                            <div className="text-xs text-gray-400 italic">Belum ada bukti.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
