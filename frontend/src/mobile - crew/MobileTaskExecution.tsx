import React, { useState, useEffect } from 'react';
import { Camera, X, Trash2, CheckCircle, Image as ImageIcon, Calendar, User, ChevronLeft, ChevronRight } from 'lucide-react';
import MobileEvidenceListModal from './MobileEvidenceListModal';
import MobileCrewTaskPreview from './MobileCrewTaskPreview';
import MobileActionModal from '../general/MobileActionModal';
import MobileCameraCapture from '../general/MobileCameraCapture';
import { compressImage } from '../utils/imageCompressor';

interface MobileTaskExecutionProps {
    task: any;
    onClose: () => void;
    onUpload: (formData: FormData) => Promise<void>;
    onDelete?: (evidenceId: number) => Promise<void>;
}

export default function MobileTaskExecution({ task, onClose, onUpload, onDelete }: MobileTaskExecutionProps) {
    const isPastDue = new Date(task.due_at) < new Date();
    const isReadOnly = task.status === 'approved' || isPastDue;

    const [animateIn, setAnimateIn] = useState(false);

    // View States
    const [showHistory, setShowHistory] = useState(false); // Acts as "Preview Mode"
    const [showEvidenceList, setShowEvidenceList] = useState(isReadOnly); // Acts as "List Mode" (Init with ReadOnly)

    const getInitialPreview = (imgUrl: string | null) => {
        if (!imgUrl) return null;
        return imgUrl.startsWith('http') || imgUrl.startsWith('blob:') || imgUrl.startsWith('/storage/') ? imgUrl : `/storage/${imgUrl}`;
    };

    const beforeEvidences = task.evidences?.filter((e: any) => e.type === 'before') || [];
    const afterEvidences = task.evidences?.filter((e: any) => e.type === 'after') || [];
    const canUploadBefore = !isReadOnly && beforeEvidences.length === 0;
    const canUploadAfter = !isReadOnly && afterEvidences.length < 3;

    const beforePreview = beforeEvidences.length > 0 ? getInitialPreview(beforeEvidences[beforeEvidences.length - 1].file_path) : null;
    const afterPreview = afterEvidences.length > 0 ? getInitialPreview(afterEvidences[afterEvidences.length - 1].file_path) : null;

    // Loading State
    const [isUploading, setIsUploading] = useState(false);

    // Preview State
    const [activeTab, setActiveTab] = useState<'before' | 'after'>('before');

    // Modal State
    const [showActionModal, setShowActionModal] = useState(false);
    const [activeUploadType, setActiveUploadType] = useState<'before' | 'after' | null>(null);
    const [initialPreviewIndex, setInitialPreviewIndex] = useState(0);

    // Camera State
    const [showCamera, setShowCamera] = useState(false);

    // Hidden Input Refs
    const galleryInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        setAnimateIn(true);
    }, []);

    const handleSlotClick = (type: 'before' | 'after') => {
        if (type === 'before' && !canUploadBefore) return;
        if (type === 'after' && !canUploadAfter) return;

        setActiveUploadType(type);
        setShowActionModal(true);
    };

    const triggerFileSelect = (source: 'gallery' | 'camera') => {
        if (source === 'camera') {
            setShowCamera(true);
        } else if (source === 'gallery' && galleryInputRef.current) {
            galleryInputRef.current.click();
        }
        setShowActionModal(false);
    };

    const handleCameraCapture = async (file: File) => {
        setShowCamera(false);
        if (!activeUploadType) return;

        // Immediate Upload with Compression
        setIsUploading(true);
        try {
            const compressedFile = await compressImage(file, 1200, 1200, 0.7);
            const formData = new FormData();
            formData.append(`${activeUploadType}[]`, compressedFile);

            await onUpload(formData);
        } catch (error) {
            console.error(error);
            alert("Upload failed");
        } finally {
            setIsUploading(false);
        }
    };

    const handleClose = () => {
        if (showEvidenceList) {
            if (isReadOnly) {
                onClose(); // Close app/modal directly if read-only
            } else {
                // Level 2: Close List -> Return to Upload View
                setShowEvidenceList(false);
            }
        } else {
            // Level 3: Close Entire Modal -> Return to Dashboard
            onClose();
        }
    };

    const handleHistoryClick = () => {
        // Open List View
        setShowActionModal(false);
        setShowEvidenceList(true);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isReadOnly || !activeUploadType) return; // Prevent upload in read-only mode or if no type

        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            // Immediate Upload with Compression
            setIsUploading(true);
            try {
                const compressedFile = await compressImage(file, 1200, 1200, 0.7);
                const formData = new FormData();
                formData.append(`${activeUploadType}[]`, compressedFile);

                await onUpload(formData);
            } catch (error) {
                console.error(error);
                alert("Upload failed");
            } finally {
                setIsUploading(false);
                // Reset input
                e.target.value = '';
            }
        }
    };

    const handleDeleteEvidence = async (evidenceId: number) => {
        if (isReadOnly || !onDelete) return; // Prevent delete in read-only mode

        try {
            await onDelete(evidenceId);
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    // STACKED RENDER
    return (
        <>
            {/* Hidden Inputs for Shared Use */}
            <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={isReadOnly}
            />

            {showCamera && (
                <MobileCameraCapture
                    onCapture={handleCameraCapture}
                    onClose={() => setShowCamera(false)}
                />
            )}

            {/* 1. Underlying Upload View */}
            {!isReadOnly && (
                <div key="upload-view" className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose}></div>

                    {/* Modal Content */}
                    <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl z-10 animate-fade-in-up">

                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800 text-lg">Upload Evidence</h3>
                            <button onClick={handleClose} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Upload Grid */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {/* Before Button Slot */}
                            <div className="relative group">
                                <div
                                    onClick={() => handleSlotClick('before')}
                                    className={`aspect-square bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform ${isUploading ? 'opacity-50 pointer-events-none' : ''} ${canUploadBefore ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50' : 'cursor-default opacity-70'}`}
                                >
                                    {beforePreview ? (
                                        <div className="relative w-full h-full">
                                            <img src={beforePreview} alt="Before" className="w-full h-full object-cover rounded-3xl shadow-sm opacity-60" />
                                            {/* Count Badge Overlay */}
                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 rounded-3xl backdrop-blur-[1px]">
                                                <div className="bg-blue-500/90 text-white font-bold text-xl px-4 py-2 rounded-2xl shadow flex items-center gap-2">
                                                    <Camera size={20} />
                                                    +{beforeEvidences.length}
                                                </div>
                                                <span className="text-white font-bold text-xs mt-2 drop-shadow-md">Before</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="bg-white p-3 rounded-full shadow-sm text-gray-400 group-hover:text-blue-500 transition-colors">
                                                <Camera size={24} />
                                            </div>
                                            <span className="font-bold text-gray-500 text-sm group-hover:text-blue-600">Before</span>
                                            {!canUploadBefore && (
                                                <span className="text-[10px] text-gray-400 text-center px-3">Max 1 photo</span>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* After Button Slot */}
                            <div className="relative group">
                                <div
                                    onClick={() => handleSlotClick('after')}
                                    className={`aspect-square bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform ${isUploading ? 'opacity-50 pointer-events-none' : ''} ${canUploadAfter ? 'cursor-pointer hover:border-purple-400 hover:bg-purple-50' : 'cursor-default opacity-70'}`}
                                >
                                    {afterPreview ? (
                                        <div className="relative w-full h-full">
                                            <img src={afterPreview} alt="After" className="w-full h-full object-cover rounded-3xl shadow-sm opacity-60" />
                                            {/* Count Badge Overlay */}
                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 rounded-3xl backdrop-blur-[1px]">
                                                <div className="bg-purple-500/90 text-white font-bold text-xl px-4 py-2 rounded-2xl shadow flex items-center gap-2">
                                                    <ImageIcon size={20} />
                                                    +{afterEvidences.length}
                                                </div>
                                                <span className="text-white font-bold text-xs mt-2 drop-shadow-md">After</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="bg-white p-3 rounded-full shadow-sm text-gray-400 group-hover:text-purple-500 transition-colors">
                                                <ImageIcon size={24} />
                                            </div>
                                            <span className="font-bold text-gray-500 text-sm group-hover:text-purple-600">After</span>
                                            {!canUploadAfter && (
                                                <span className="text-[10px] text-gray-400 text-center px-3">Max 3 photos</span>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions (History & Done) */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleHistoryClick}
                                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-full shadow-sm active:scale-95 transition-transform text-sm hover:bg-gray-200"
                            >
                                History
                            </button>
                            <button
                                onClick={handleClose}
                                className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-full shadow-lg active:scale-95 transition-transform text-sm hover:bg-blue-700"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Popup Modal */}
            <MobileActionModal
                isOpen={showActionModal}
                onClose={() => setShowActionModal(false)}
                onUpload={() => triggerFileSelect('gallery')}
                onTakePhoto={() => triggerFileSelect('camera')}
                onHistory={handleHistoryClick}
            />


            {/* 2. Overlying List View */}
            <MobileEvidenceListModal
                isOpen={showEvidenceList}
                onClose={handleClose}
                task={task}
                onSelectImage={(type, index = 0) => {
                    setActiveTab(type as 'before' | 'after');
                    setInitialPreviewIndex(index);
                    setShowHistory(true);
                }}
                onDelete={handleDeleteEvidence}
                readOnly={isReadOnly}
            />

            {/* 3. Deepest History Preview */}
            <MobileCrewTaskPreview
                task={task}
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                initialIndex={initialPreviewIndex}
                onDelete={handleDeleteEvidence}
                readOnly={isReadOnly}
            />
        </>
    );
}
