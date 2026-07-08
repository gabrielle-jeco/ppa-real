import React from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';

interface MobileCrewActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload: () => void;
    onTakePhoto: () => void;
    onHistory: () => void;
}

const MobileCrewActionModal: React.FC<MobileCrewActionModalProps> = ({ isOpen, onClose, onUpload, onTakePhoto, onHistory }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>

            {/* Modal Content */}
            <div className="bg-white rounded-[2rem] p-6 w-full max-w-sm z-10 shadow-2xl animate-fade-in-up">

                {/* Large Action Buttons */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <button
                        onClick={onUpload}
                        className="aspect-square bg-gray-50 border border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform hover:bg-gray-100"
                    >
                        <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                            <ImageIcon size={28} />
                        </div>
                        <span className="font-bold text-gray-700 text-sm">Unggah</span>
                    </button>
                    <button
                        onClick={onTakePhoto}
                        className="aspect-square bg-gray-50 border border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform hover:bg-gray-100"
                    >
                        <div className="bg-purple-100 p-3 rounded-full text-purple-600">
                            <Camera size={28} />
                        </div>
                        <span className="font-bold text-gray-700 text-sm">Ambil Foto</span>
                    </button>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onHistory}
                        className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-full shadow-sm active:scale-95 transition-transform text-sm hover:bg-gray-200"
                    >
                        Riwayat
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-full shadow-lg active:scale-95 transition-transform text-sm hover:bg-blue-700"
                    >
                        Selesai
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileCrewActionModal;
