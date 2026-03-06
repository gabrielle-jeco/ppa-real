import React, { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import CrewLayout from './CrewLayout';

interface MobileTaskGuideProps {
    onBack: () => void;
    role: string;
}

export default function MobileTaskGuide({ onBack, role }: MobileTaskGuideProps) {
    const [isRead, setIsRead] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dbGuides, setDbGuides] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAlreadyConfirmed, setIsAlreadyConfirmed] = useState(false);

    useEffect(() => {
        const fetchGuidesAndStatus = async () => {
            setIsLoading(true);
            try {
                // Fetch Guides
                const resGuides = await fetch('/api/work-stations', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                });
                if (resGuides.ok) {
                    const data = await resGuides.json();
                    setDbGuides(data);
                }

                // Check if already read today
                const resStatus = await fetch(`/api/crew/check-guide?role=${role}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                });
                if (resStatus.ok) {
                    const statusData = await resStatus.json();
                    if (statusData.has_read) {
                        setIsAlreadyConfirmed(true);
                        setIsRead(true); // Automatically check the box
                    }
                }
            } catch (error) {
                console.error("Failed to fetch guide info", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchGuidesAndStatus();
    }, []);

    const station = dbGuides.find(g => g.name.toLowerCase() === role.toLowerCase());

    // Normalize DB guides which might be just an array of strings
    const normalizedDbSteps = station?.guide_content?.map((step: any) => {
        if (typeof step === 'string') {
            return { title: 'Instruction', desc: step };
        }
        return step;
    });

    const content = station?.guide_content ? {
        title: `Crew - ${station.name} Guide`,
        steps: normalizedDbSteps
    } : {
        title: `Crew - ${role.charAt(0).toUpperCase() + role.slice(1)} Guide`,
        steps: [{ title: 'Information', desc: 'No specific guide assigned for this workstation currently.' }]
    };

    const handleConfirm = async () => {
        if (!isRead) return;
        setIsSubmitting(true);
        try {
            const response = await fetch('/api/crew/read-guide', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ role })
            });
            if (response.ok) {
                onBack(); // Return to dashboard
            } else {
                alert('Failed to confirm guide.');
            }
        } catch (error) {
            console.error('Error confirming guide:', error);
            alert('An error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <CrewLayout
            title="Task Guide"
            showBack={true}
            onBack={onBack}
        >
            <div className="flex flex-col h-full pb-6">
                {isLoading ? (
                    <div className="flex justify-center items-center h-48">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        {/* 1. Guide Content Card */}
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6">
                            <div className="flex items-center gap-3 mb-4 text-blue-600">
                                <BookOpen size={24} />
                                <h2 className="font-bold text-lg">{content.title}</h2>
                            </div>

                            <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
                                {content.steps.map((step: any, index: number) => (
                                    <p key={index}>
                                        <strong>{index + 1}. {step.title}:</strong><br />
                                        {step.desc}
                                    </p>
                                ))}
                            </div>
                        </div>

                        {/* 2. Standardized Checkbox Card */}
                        <label className={`flex items-center gap-3 bg-white p-4 rounded-xl border transition mb-6 shadow-sm ${isAlreadyConfirmed ? 'border-green-200 bg-green-50 opacity-80 cursor-default' : 'cursor-pointer border-blue-100 hover:bg-blue-50'}`}>
                            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${isRead ? 'bg-blue-100 border-blue-500 text-blue-600' : 'border-gray-300 bg-white'}`}>
                                {isRead && <span className="font-bold text-xs">✓</span>}
                            </div>
                            <input
                                type="checkbox"
                                checked={isRead}
                                onChange={(e) => {
                                    if (!isAlreadyConfirmed) setIsRead(e.target.checked);
                                }}
                                disabled={isAlreadyConfirmed}
                                className="hidden"
                            />
                            <span className="text-sm font-semibold text-gray-700">
                                {isAlreadyConfirmed ? 'You have already read and confirmed this guide today.' : 'I have read and understood'}
                            </span>
                        </label>

                        {/* Spacer to push button down if content is short */}
                        <div className="flex-1"></div>

                        {/* 3. Primary Action Button */}
                        <button
                            onClick={handleConfirm}
                            disabled={!isRead || isSubmitting || isAlreadyConfirmed}
                            className={`w-full font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform flex justify-center items-center ${isAlreadyConfirmed ? 'bg-green-500 text-white shadow-green-200' : 'bg-blue-600 text-white shadow-blue-200'} disabled:opacity-50 disabled:shadow-none`}
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : isAlreadyConfirmed ? (
                                "Already Confirmed"
                            ) : (
                                "Confirm & Start Work"
                            )}
                        </button>
                    </>
                )}
            </div>
        </CrewLayout>
    );
}
