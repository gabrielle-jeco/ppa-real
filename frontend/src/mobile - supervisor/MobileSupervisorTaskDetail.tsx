import React, { useState, useEffect } from 'react';
import { Camera, X, Trash2, CheckCircle, Image as ImageIcon, ChevronLeft } from 'lucide-react';
import MobileEvidenceListModal from '../mobile - crew/MobileEvidenceListModal';
import MobileCrewTaskPreview from '../mobile - crew/MobileCrewTaskPreview';
import MobileActionModal from '../general/MobileActionModal';
import MobileCameraCapture from '../general/MobileCameraCapture';
import { compressImage } from '../utils/imageCompressor';

interface MobileSupervisorTaskDetailProps {
    task: any;
    onClose: () => void;
    // Supervisor uses different API endpoint logic maybe? 
    onUpload: (formData: FormData) => Promise<void>;
    onDelete?: (type: 'before' | 'after') => Promise<void>;
}

export default function MobileSupervisorTaskDetail({ task, onClose, onUpload, onDelete }: MobileSupervisorTaskDetailProps) {
    // Calculated State
    const isApproved = task.status === 'approved';
    const isPastDue = new Date(task.due_at) < new Date(new Date().setHours(0, 0, 0, 0));
    const isReadOnly = isApproved || isPastDue;

    const [animateIn, setAnimateIn] = useState(false);

    // View States
    const [showEvidenceList, setShowEvidenceList] = useState(isReadOnly);
    const [showHistory, setShowHistory] = useState(false); // Preview

    // Modal State
    const [showActionModal, setShowActionModal] = useState(false);
    const [activeUploadType, setActiveUploadType] = useState<'before' | 'after' | null>(null);

    // Camera State
    const [showCamera, setShowCamera] = useState(false);

    // Upload State (Preview only)
    const getInitialPreview = (imgUrl: string | null) => {
        if (!imgUrl) return null;
        return imgUrl.startsWith('http') || imgUrl.startsWith('blob:') || imgUrl.startsWith('/storage/') ? imgUrl : `/storage/${imgUrl}`;
    };

    const [beforePreview, setBeforePreview] = useState<string | null>(getInitialPreview(task.before_image));
    const [afterPreview, setAfterPreview] = useState<string | null>(getInitialPreview(task.after_image));

    // Sync state with upstream task changes (e.g., after successful API upload/delete)
    useEffect(() => {
        if (task.before_image && !task.before_image.startsWith('blob:')) setBeforePreview(getInitialPreview(task.before_image));
        else if (!task.before_image) setBeforePreview(null);

        if (task.after_image && !task.after_image.startsWith('blob:')) setAfterPreview(getInitialPreview(task.after_image));
        else if (!task.after_image) setAfterPreview(null);
    }, [task.before_image, task.after_image]);

    const [isUploading, setIsUploading] = useState(false);

    // Preview State
    const [activeTab, setActiveTab] = useState<'before' | 'after'>('before');

    // Hidden Input Refs
    const galleryInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        setAnimateIn(true);
    }, []);

    const handleSlotClick = (type: 'before' | 'after') => {
        if (isReadOnly) return;
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

    const handleClose = () => {
        if (showEvidenceList) {
            if (isReadOnly) {
                onClose();
            } else {
                setShowEvidenceList(false);
            }
        } else {
            onClose();
        }
    };

    const handleHistoryClick = () => {
        setShowActionModal(false);
        setShowEvidenceList(true);
    };

    const handleCameraCapture = async (file: File) => {
        setShowCamera(false);
        if (isReadOnly || !activeUploadType) return;

        const previewUrl = URL.createObjectURL(file);
        if (activeUploadType === 'before') setBeforePreview(previewUrl);
        else setAfterPreview(previewUrl);

        // Immediate Upload with Compression
        setIsUploading(true);
        try {
            const compressedFile = await compressImage(file, 1200, 1200, 0.7);
            const formData = new FormData();
            formData.append(activeUploadType, compressedFile);

            await onUpload(formData);
        } catch (error: any) {
            console.error(error);
            let errorMessage = "Gagal mengunggah foto. Silakan coba lagi.";
            try {
                const parsed = JSON.parse(error.message);
                if (parsed.message) errorMessage = parsed.message;
            } catch (e) {
                if (error.message) errorMessage = error.message;
            }
            alert(errorMessage);
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isReadOnly || !activeUploadType) return;

        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const previewUrl = URL.createObjectURL(file);

            if (activeUploadType === 'before') setBeforePreview(previewUrl);
            else setAfterPreview(previewUrl);

            // Immediate Upload with Compression
            setIsUploading(true);
            try {
                const compressedFile = await compressImage(file, 1200, 1200, 0.7);
                const formData = new FormData();
                formData.append(activeUploadType, compressedFile);

                await onUpload(formData);
            } catch (error: any) {
                console.error(error);
                let errorMessage = "Gagal mengunggah foto. Silakan coba lagi.";
                try {
                    const parsed = JSON.parse(error.message);
                    if (parsed.message) errorMessage = parsed.message;
                } catch (e) {
                    if (error.message) errorMessage = error.message;
                }
                alert(errorMessage);
            } finally {
                setIsUploading(false);
                e.target.value = '';
            }
        }
    };

    const handleDeleteEvidence = async (type: 'before' | 'after') => {
        if (isReadOnly || !onDelete) return;

        try {
            await onDelete(type);
            if (type === 'before') setBeforePreview(null);
            else setAfterPreview(null);
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    return (
        <>
            {/* Hidden Inputs */}
            <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isReadOnly} />

            {showCamera && (
                <MobileCameraCapture
                    onCapture={handleCameraCapture}
                    onClose={() => setShowCamera(false)}
                />
            )}

            {/* 1. Underlying Upload View */}
            {!isReadOnly && (
                <div key="upload-view" className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose}></div>
                    <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl z-10 animate-fade-in-up">

                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800 text-lg">Supervisor Checklist</h3>
                            <button onClick={handleClose} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Upload Grid */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {/* Before Slot */}
                            <div className="relative group">
                                <div
                                    onClick={() => handleSlotClick('before')}
                                    className={`aspect-square bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform ${isUploading ? 'opacity-50 pointer-events-none' : ''} ${isReadOnly ? 'cursor-default' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50'}`}
                                >
                                    {beforePreview ? (
                                        <div className="relative w-full h-full">
                                            <img src={beforePreview} alt="Before" className="w-full h-full object-cover rounded-3xl shadow-sm" />
                                            <div className="absolute bottom-2 right-2 bg-white/80 p-1.5 rounded-full backdrop-blur-sm">
                                                <CheckCircle size={16} className="text-green-500" />
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="bg-white p-3 rounded-full shadow-sm text-gray-400 group-hover:text-blue-500 transition-colors">
                                                <Camera size={24} />
                                            </div>
                                            <span className="font-bold text-gray-500 text-sm group-hover:text-blue-600">Before</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* After Slot */}
                            <div className="relative group">
                                <div
                                    onClick={() => handleSlotClick('after')}
                                    className={`aspect-square bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform ${isUploading ? 'opacity-50 pointer-events-none' : ''} ${isReadOnly ? 'cursor-default' : 'cursor-pointer hover:border-purple-400 hover:bg-purple-50'}`}
                                >
                                    {afterPreview ? (
                                        <div className="relative w-full h-full">
                                            <img src={afterPreview} alt="After" className="w-full h-full object-cover rounded-3xl shadow-sm" />
                                            <div className="absolute bottom-2 right-2 bg-white/80 p-1.5 rounded-full backdrop-blur-sm">
                                                <CheckCircle size={16} className="text-green-500" />
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="bg-white p-3 rounded-full shadow-sm text-gray-400 group-hover:text-purple-500 transition-colors">
                                                <ImageIcon size={24} />
                                            </div>
                                            <span className="font-bold text-gray-500 text-sm group-hover:text-purple-600">After</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="flex items-center gap-3">
                            <button onClick={handleHistoryClick} className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-full shadow-sm active:scale-95 transition-transform text-sm hover:bg-gray-200">
                                History
                            </button>
                            <button onClick={handleClose} className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-full shadow-lg active:scale-95 transition-transform text-sm hover:bg-blue-700">
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <MobileActionModal
                isOpen={showActionModal}
                onClose={() => setShowActionModal(false)}
                onUpload={() => triggerFileSelect('gallery')}
                onTakePhoto={() => triggerFileSelect('camera')}
                onHistory={handleHistoryClick}
            />

            <MobileEvidenceListModal
                isOpen={showEvidenceList}
                onClose={handleClose}
                task={{
                    ...task,
                    before_image: beforePreview,
                    after_image: afterPreview
                }}
                onSelectImage={(type) => {
                    setActiveTab(type as 'before' | 'after');
                    setShowHistory(true);
                }}
                onDelete={(type) => {
                    if (type === 'before' || type === 'after') handleDeleteEvidence(type);
                }}
                readOnly={isReadOnly}
            />

            <MobileCrewTaskPreview
                task={task}
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                beforeImage={beforePreview}
                afterImage={afterPreview}
                onDelete={handleDeleteEvidence}
                readOnly={isReadOnly}
            />
        </>
    );
}
