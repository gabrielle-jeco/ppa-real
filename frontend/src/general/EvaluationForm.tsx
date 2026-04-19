import { useState, useEffect } from "react";

interface EvaluationFormProps {
    supervisor: any;
    targetDate: Date;
    onSuccess: () => void;
}

const CRITERIA = [
    {
        id: 'self_development',
        label: 'Pengembangan Diri',
        desc: '1. Tidak memiliki kemampuan belajar hal baru\n2. Tidak memiliki kemauan belajar hal baru\n3. Mau belajar hal baru terkait pekerjaannya\n4. Mau belajar hal baru bermanfaat untuk mengembangkan atau memudahkan pekerjaan\n5. Memiliki keterampilan berbagai pekerjaan dan cepat menguasai hal baru.'
    },
    {
        id: 'teamwork',
        label: 'Kerjasama dan Komunikasi',
        desc: '1. Tidak dapat menyesuaikan diri + keluhan rekan\n2. Sulit menyesuaikan diri tetapi tidak ada keluhan\n3. Butuh Waktu penyesuaian dengan tim kerja\n4. Mudah menyesuaikan diri tetapi terbatas pada bagian/departemen saja\n5. Mampu menyesuaikan diri dimanapun & dengan sosialisasi tersebut kinerja tim meningkat.'
    },
];

export default function EvaluationForm({ supervisor, targetDate, onSuccess }: EvaluationFormProps) {
    const [scores, setScores] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);

    const handleScoreChange = (id: string, value: number) => {
        setScores(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async () => {
        // Validate
        if (Object.keys(scores).length < CRITERIA.length) {
            alert("Please score all criteria.");
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / CRITERIA.length * 20;

            // Use passed targetDate
            const dateStr = targetDate.toLocaleDateString('en-CA'); // YYYY-MM-DD

            const res = await fetch('/api/evaluations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: supervisor.id,
                    date: dateStr,
                    scores: scores,
                    total_score: totalScore
                })
            });

            if (res.ok) {
                onSuccess();
            } else {
                console.error("Evaluation failed");
                alert("Failed to submit evaluation");
            }
        } catch (error) {
            console.error("Error submitting evaluation", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-2">MONTHLY EVALUATION</h2>
            <p className="text-sm text-gray-400 mb-6 uppercase tracking-wider">Sikap Kepribadian</p>

            <div className="space-y-8">
                {CRITERIA.map((criterion, idx) => (
                    <div key={criterion.id}>
                        <h3 className="font-semibold text-gray-700 mb-1">
                            {String.fromCharCode(97 + idx)}. {criterion.label}
                        </h3>
                        <div className="text-xs text-gray-500 mb-3 leading-relaxed space-y-1">
                            {criterion.desc.split('\n').map((line, i) => (
                                <p key={i} className="">{line}</p>
                            ))}
                        </div>

                        <div className="flex justify-between items-center px-2">
                            {[1, 2, 3, 4, 5].map((score) => (
                                <button
                                    key={score}
                                    onClick={() => handleScoreChange(criterion.id, score)}
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

                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-md hover:bg-purple-700 transition disabled:opacity-50"
                >
                    {loading ? 'Submitting...' : 'Submit Evaluation'}
                </button>
            </div>
        </div>
    );
}
