import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RotateCcw } from 'lucide-react';

interface MobileCameraCaptureProps {
    onCapture: (file: File) => void;
    onClose: () => void;
}

const MobileCameraCapture: React.FC<MobileCameraCaptureProps> = ({ onCapture, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null); // Track active stream for cleanup
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);

    // Stop all tracks helper
    const stopTracks = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (stream) { // Fallback for state if ref missed somehow
            stream.getTracks().forEach(track => track.stop());
        }
    };

    // Initialize Camera
    useEffect(() => {
        const startCamera = async () => {
            try {
                // Constraints: Prefer back camera, HD resolution
                const constraints = {
                    video: {
                        facingMode: { ideal: 'environment' }, // Back camera
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                };

                const currentStream = await navigator.mediaDevices.getUserMedia(constraints);

                // Stop previous if exists (safety)
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                }

                streamRef.current = currentStream;
                setStream(currentStream);

                if (videoRef.current) {
                    videoRef.current.srcObject = currentStream;
                }
            } catch (err) {
                console.error("Camera Error:", err);
                setError("Kamera tidak bisa diakses. Pastikan izin kamera sudah diberikan dan aplikasi dibuka melalui HTTPS.");
            }
        };

        startCamera();

        return () => {
            // Cleanup: Stop all tracks on unmount
            stopTracks();
        };
    }, []);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            // Set canvas size to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw current video frame
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Get data URL
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                setCapturedImage(dataUrl);

                // Stop stream preview
                stopTracks();
            }
        }
    };

    const handleRetake = async () => {
        setCapturedImage(null);
        // Restart Camera
        try {
            const constraints = {
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            };
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);

            streamRef.current = newStream;
            setStream(newStream);

            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
        } catch {
            setError("Gagal membuka ulang kamera.");
        }
    };

    const handleConfirm = async () => {
        if (!capturedImage) return;

        // Convert base64 to File object
        const res = await fetch(capturedImage);
        const blob = await res.blob();
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });

        onCapture(file);
    };

    return (
        <div className="fixed inset-0 z-[20000] bg-black flex flex-col">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
                <button onClick={onClose} className="p-2 bg-black/20 rounded-full text-white backdrop-blur-md">
                    <X size={24} />
                </button>
                <div className="text-white font-bold text-shadow">Ambil Foto</div>
                <div className="w-10"></div> {/* Spacer */}
            </div>

            {/* Viewport */}
            <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
                {error ? (
                    <div className="text-white text-center p-8">
                        <p className="mb-4 text-red-400">{error}</p>
                        <button onClick={onClose} className="bg-white/20 px-4 py-2 rounded-lg">Tutup</button>
                    </div>
                ) : capturedImage ? (
                    <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
                ) : (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                    />
                )}
                <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Controls */}
            <div className="bg-black/80 p-8 pb-12 flex justify-center items-center gap-8">
                {capturedImage ? (
                    <>
                        <button
                            onClick={handleRetake}
                            className="flex-1 bg-gray-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2"
                        >
                            <RotateCcw size={20} />
                            Ulangi
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2"
                        >
                            <Camera size={20} />
                            Pakai Foto
                        </button>
                    </>
                ) : (
                    <button
                        onClick={handleCapture}
                        className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center group active:scale-95 transition-transform"
                    >
                        <div className="w-16 h-16 bg-white rounded-full group-active:bg-gray-200 transition-colors"></div>
                    </button>
                )}
            </div>
        </div>
    );
};

export default MobileCameraCapture;
