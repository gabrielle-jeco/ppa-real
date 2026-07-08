import React from 'react';
import { Camera, Image as ImageIcon, History } from 'lucide-react';

interface MobileUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload: () => void;
    onTakePhoto: () => void;
    onHistory: () => void;
}

const MobileUploadModal: React.FC<MobileUploadModalProps> = ({ isOpen, onClose, onUpload, onTakePhoto, onHistory }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>

            {/* Modal Content */}
            <div className="bg-white rounded-[2rem] p-6 w-full max-w-sm z-10 shadow-2xl animate-fade-in-up">

                {/* Large Action Buttons */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <button
                        onClick={onUpload}
                        className="aspect-square bg-gray-200 rounded-3xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform"
                    >
                        <ImageIcon size={32} className="text-gray-600" />
                        <span className="font-bold text-gray-700 text-sm">Unggah</span>
                    </button>
                    <button
                        onClick={onTakePhoto}
                        className="aspect-square bg-gray-200 rounded-3xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform"
                    >
                        <Camera size={32} className="text-gray-600" />
                        <span className="font-bold text-gray-700 text-sm">Ambil Foto</span>
                    </button>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onHistory}
                        className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-full shadow-lg active:scale-95 transition-transform text-sm"
                    >
                        Riwayat
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-full shadow-lg active:scale-95 transition-transform text-sm"
                    >
                        Selesai
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileUploadModal;
