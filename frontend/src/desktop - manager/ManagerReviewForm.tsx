import { useState } from 'react';

interface ManagerReviewFormProps {
    supervisor: any;
    targetDate: Date;
    evaluationStatus: any;
    onSuccess: () => void;
}

const REVIEW_CRITERIA = [
    {
        id: 'direction_execution',
        label: 'Pelaksanaan Arahan',
        desc: 'Kemampuan supervisor menjalankan arahan SM/RM sesuai prioritas dan tenggat.'
    },
    {
        id: 'crew_follow_up',
        label: 'Follow Up Crew',
        desc: 'Konsistensi supervisor memantau crew, memberi arahan, dan menutup kendala operasional.'
    },
    {
        id: 'assignment_quality',
        label: 'Kualitas Penugasan',
        desc: 'Ketepatan supervisor memberi task yang relevan, jelas, dan merata ke crew.'
    },
];

export default function ManagerReviewForm({ supervisor, targetDate, evaluationStatus, onSuccess }: ManagerReviewFormProps) {
    const [scores, setScores] = useState<Record<string, number>>({});
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    const existing = evaluationStatus?.data;
    const isLocked = evaluationStatus?.is_locked || evaluationStatus?.can_evaluate === false;

    const handleSubmit = async () => {
        if (Object.keys(scores).length < REVIEW_CRITERIA.length) {
            alert('Please score all review criteria.');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0) / REVIEW_CRITERIA.length * 20;
            const dateStr = targetDate.toLocaleDateString('en-CA');

            const res = await fetch('/api/evaluations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    user_id: supervisor.id,
                    date: dateStr,
                    scores,
                    total_score: totalScore,
                    notes,
                }),
            });

            if (res.ok) {
                onSuccess();
                return;
            }

            const errorData = await res.json().catch(() => null);
            alert(errorData?.error || 'Failed to submit manager review.');
        } catch (error) {
            console.error('Manager review failed', error);
            alert('Failed to submit manager review.');
        } finally {
            setLoading(false);
        }
    };

    if (existing || isLocked) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full overflow-y-auto">
                <h2 className="text-xl font-bold text-gray-800 mb-2">MANAGER REVIEW</h2>
                <p className="text-sm text-gray-400 mb-6 uppercase tracking-wider">
                    {targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>

                <div className={`rounded-2xl p-6 border ${existing ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${existing ? 'text-green-600' : 'text-gray-400'}`}>
                        {existing ? 'Review Submitted' : 'Review Period Locked'}
                    </p>
                    <h3 className="text-4xl font-bold text-gray-800 mb-2">{existing?.total_score ?? existing?.score ?? 0}</h3>
                    <p className="text-sm text-gray-500">
                        {existing
                            ? 'This supervisor review has been submitted and is now shown as read-only.'
                            : 'This month is no longer open for supervisor review. Missing review score is counted as 0.'}
                    </p>
                </div>

                {existing?.notes && (
                    <div className="mt-5 bg-white border border-gray-100 rounded-2xl p-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Manager Notes</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{existing.notes}</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-2">MANAGER REVIEW</h2>
            <p className="text-sm text-gray-400 mb-6 uppercase tracking-wider">Supervisor Project & Direction</p>

            <div className="space-y-7">
                {REVIEW_CRITERIA.map((criterion, idx) => (
                    <div key={criterion.id}>
                        <h3 className="font-semibold text-gray-700 mb-1">
                            {String.fromCharCode(97 + idx)}. {criterion.label}
                        </h3>
                        <p className="text-xs text-gray-500 mb-3 leading-relaxed">{criterion.desc}</p>

                        <div className="flex justify-between items-center px-2">
                            {[1, 2, 3, 4, 5].map((score) => (
                                <button
                                    key={score}
                                    onClick={() => setScores(prev => ({ ...prev, [criterion.id]: score }))}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-sm ${scores[criterion.id] === score
                                        ? 'bg-primary text-white scale-110 ring-4 ring-purple-100'
                                        : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                        }`}
                                >
                                    {score}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Manager Notes</label>
                    <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        className="w-full min-h-28 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-purple-50"
                        placeholder="Brief notes about direction, follow-up, or coaching points..."
                    />
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-md hover:bg-purple-700 transition disabled:opacity-50"
                >
                    {loading ? 'Submitting...' : 'Submit Review'}
                </button>
            </div>
        </div>
    );
}
