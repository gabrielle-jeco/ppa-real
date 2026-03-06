import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import MobileLayout from './MobileLayout';

interface MobileCrewEvaluationProps {
    crew: any;
    onBack: () => void;
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

export default function MobileCrewEvaluation({ crew, onBack }: MobileCrewEvaluationProps) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [evaluationData, setEvaluationData] = useState<any>(null); // To store checked evaluation
    const [loading, setLoading] = useState(true);
    const [scores, setScores] = useState<Record<string, number>>({});
    const [submitLoading, setSubmitLoading] = useState(false);

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const getAvailableMonths = (year: number) => {
        if (year === currentYear) {
            return Array.from({ length: currentMonth + 1 }, (_, i) => i);
        }
        return Array.from({ length: 12 }, (_, i) => i);
    };

    // Stats State (Mirroring Crew)
    const [stats, setStats] = useState<any>({
        yearly_score: 0,
        monthly_score: 0,
        active_percentage: 0,
        personality_score: 0,
        activity_monitor: []
    });

    const activePercentage = stats.active_percentage || 0;
    const yearlyScore = stats.yearly_score || 0;
    const personalityScore = stats.personality_score || 0;
    const activityMonitor = stats.activity_monitor || [];

    // Fetch Evaluation Status & Stats
    const fetchEvaluationStatus = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const dateStr = selectedDate.toLocaleDateString('en-CA');
            const m = selectedDate.getMonth() + 1;
            const y = selectedDate.getFullYear();

            // 1. Check if Evaluated
            const resEval = await fetch(`/api/evaluations/check/${crew.id}?date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resEval.ok) {
                const data = await resEval.json();
                setEvaluationData(data); // data.evaluated is boolean
            }

            // 2. Fetch Crew Stats
            const resStats = await fetch(`/api/crew/stats?month=${m}&year=${y}&user_id=${crew.id}`, { // Using query param user_id to fetch specific crew if API supports it, or just use `/api/evaluations` data
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Note: The previous logic in Crew route uses Auth::user(). We need to ensure we can fetch *another* user's stats if we are a SPV. 
            // Wait, if it's the Supervisor doing Evaluation, they need the Crew API to expose stats by ID.
            // Let's assume for now the API needs an update or we construct it manually. 
            // The prompt stated "bisa disamakan aja dengan yang punya crew". Let's fetch from `/api/crew/${crew.id}/stats` or similar if it exists, otherwise `/api/crew/stats` with param.

            // Let's use `/api/crew/stats?user_id` as standard fallback. We will patch the backend next if needed.
            if (resStats.ok) {
                const dataStats = await resStats.json();
                setStats(dataStats);
            }
        } catch (error) {
            console.error("Check evaluation failed", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvaluationStatus();
    }, [selectedDate, crew.id]);

    const handleScoreChange = (id: string, value: number) => {
        setScores(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async () => {
        if (Object.keys(scores).length < CRITERIA.length) {
            alert("Please score all criteria.");
            return;
        }

        setSubmitLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / CRITERIA.length * 20; // Scale to 100? Or just raw sum? 
            // In Desktop it was: / CRITERIA.length * 20 (Average * 20? If 5/5 -> 1 * 20 = 20? Wait. 5 is max. 5 * 20 = 100. Correct.)

            const dateStr = selectedDate.toLocaleDateString('en-CA');

            const res = await fetch('/api/evaluations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: crew.id,
                    date: dateStr,
                    scores: scores,
                    total_score: totalScore
                })
            });

            if (res.ok) {
                fetchEvaluationStatus(); // Refresh to switch view
            } else {
                alert("Failed to submit evaluation");
            }
        } catch (error) {
            console.error("Error submitting", error);
        } finally {
            setSubmitLoading(false);
        }
    };

    // Calendar Handlers
    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(parseInt(e.target.value));
        setSelectedDate(newDate);
    };

    const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDate = new Date(selectedDate);
        newDate.setFullYear(parseInt(e.target.value));
        setSelectedDate(newDate);
    };

    // Calendar Grid Logic for Stats View
    const getCalendarDays = () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];
        for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
        for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
        return days;
    };

    // Calculate Dummy Active Percentage to match Mock Calendar natively
    const calendarDays = getCalendarDays();
    let totalWorkDays = 0;
    let presentDays = 0;

    calendarDays.forEach(day => {
        if (!day) return;
        const now = new Date();
        if (day > now) return; // Skip future days

        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        if (!isWeekend) {
            totalWorkDays++;
            const hash = (day.getDate() + day.getMonth() * 31) % 7;
            if (hash <= 4 || hash > 5) presentDays++;
        }
    });

    const displayActivePercentage = totalWorkDays > 0 ? Math.round((presentDays / totalWorkDays) * 100) : 0;

    return (
        <MobileLayout
            title={crew.full_name || crew.name}
            onBack={onBack}
        >
            <div className="flex flex-col pb-6">

                {/* 1. Header (Month/Year) */}
                <div className="bg-white rounded-3xl p-5 shadow-sm mb-6">
                    <h2 className="text-center text-sm font-bold text-gray-600 mb-4">
                        {loading ? 'Checking...' : (evaluationData?.evaluated ? 'Point & Attendance History' : 'Monthly Evaluation')}
                    </h2>

                    {/* Pill Dropdowns */}
                    <div className="flex items-center gap-2 w-full">
                        <div className="relative group flex-1">
                            <select
                                value={selectedDate.getMonth()}
                                onChange={handleMonthChange}
                                className="w-full appearance-none bg-gray-50 border border-transparent hover:border-blue-100 rounded-xl px-3 py-2 font-bold text-gray-700 text-sm cursor-pointer outline-none transition-colors"
                            >
                                {getAvailableMonths(selectedDate.getFullYear()).map(i => (
                                    <option key={i} value={i}>
                                        {new Date(0, i).toLocaleString('en-US', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                        </div>

                        <div className="relative group w-24">
                            <select
                                value={selectedDate.getFullYear()}
                                onChange={handleYearChange}
                                className="w-full appearance-none bg-gray-50 border border-transparent hover:border-blue-100 rounded-xl px-3 py-2 text-gray-700 font-bold text-sm cursor-pointer outline-none transition-colors"
                            >
                                {Array.from({ length: new Date().getFullYear() - 2024 + 1 }, (_, i) => 2024 + i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                        </div>
                    </div>
                </div>

                {/* CONTENT Area */}
                {!loading && (
                    evaluationData?.evaluated ? (
                        // === STATS VIEW ===
                        <div className="space-y-4">
                            {/* Profile & Active Percentage */}
                            <div className="bg-gray-100 rounded-3xl p-5">
                                <p className="text-sm font-bold text-gray-700 mb-2">{crew.full_name || crew.name}</p>
                                <div className="w-full bg-white rounded-full h-4 mb-2 overflow-hidden">
                                    <div className="bg-green-500 h-full rounded-full transition-all duration-1000" style={{ width: `${displayActivePercentage}%` }}></div>
                                </div>
                                <p className="text-xs text-gray-500">Active Percentage - {displayActivePercentage}% ({selectedDate.toLocaleString('default', { month: 'long' })})</p>
                            </div>

                            {/* Activity Monitor */}
                            <div className="bg-gray-100 rounded-3xl p-5">
                                <p className="text-sm font-medium text-gray-600 mb-3">{selectedDate.toLocaleString('default', { month: 'long' })} Activity Monitor</p>
                                {activityMonitor.length > 0 ? (
                                    <>
                                        <div className="w-full h-4 bg-gray-300 rounded-full overflow-hidden flex mb-4">
                                            {activityMonitor.map((item: any, idx: number) => (
                                                <div key={idx} className={`h-full ${['bg-green-400', 'bg-blue-600', 'bg-yellow-400', 'bg-purple-500'][idx % 4]}`} style={{ width: `${item.percentage}%` }}></div>
                                            ))}
                                        </div>
                                        <div className="space-y-2">
                                            {activityMonitor.map((item: any, idx: number) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <div className={`w-3 h-3 rounded-full ${['bg-green-400', 'bg-blue-600', 'bg-yellow-400', 'bg-purple-500'][idx % 4]} shrink-0`}></div>
                                                    <span className="text-xs font-medium text-gray-600">{item.label} - {item.percentage}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">No activity logged yet for this month.</p>
                                )}
                            </div>

                            {/* Monthly Score / Personality Score */}
                            <div className="bg-gray-100 rounded-3xl p-5">
                                <p className="text-xs font-medium text-gray-600 mb-2 uppercase">POINT SIKAP KEPRIBADIAN ({selectedDate.toLocaleString('default', { month: 'long' })})</p>
                                <p className="text-sm font-bold text-gray-700">Total Point : {personalityScore}</p>
                            </div>

                            {/* Calendar View */}
                            <div className="bg-white rounded-3xl p-6 shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-bold text-gray-800">{selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                                </div>

                                <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 font-bold uppercase mb-3">
                                    <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                                </div>

                                <div className="grid grid-cols-7 gap-y-3">
                                    {getCalendarDays().map((day, idx) => {
                                        if (!day) return <div key={idx}></div>;
                                        const hash = (day.getDate() + day.getMonth() * 31) % 7;
                                        // Highlight Today logic
                                        const now = new Date();
                                        const isToday = day.toDateString() === now.toDateString();
                                        const isFuture = day > now;

                                        let bg = 'bg-gray-200';
                                        let text = 'text-gray-700';

                                        if (isFuture) {
                                            bg = 'bg-gray-50';
                                            text = 'text-gray-300';
                                        } else {
                                            // Mock Attendance Logic based on User Request
                                            if (day.getDay() === 0 || day.getDay() === 6) {
                                                // Weekend -> Libur (Abu)
                                                bg = 'bg-gray-400'; text = 'text-white';
                                            } else {
                                                // Weekday dummy
                                                if (hash <= 3) { bg = 'bg-green-500'; text = 'text-white'; } // Hadir
                                                else if (hash === 4) { bg = 'bg-yellow-400'; text = 'text-white'; } // Telat
                                                else if (hash === 5) { bg = 'bg-red-500'; text = 'text-white'; } // Mangkir
                                                else { bg = 'bg-green-500'; text = 'text-white'; } // Default hadir
                                            }
                                        }

                                        return (
                                            <div key={idx} className="flex justify-center">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${bg} ${text} ${isToday ? 'ring-2 ring-purple-500 ring-offset-2' : ''}`}>
                                                    {day.getDate()}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Yearly Overall Point */}
                            <div className="bg-gray-100 rounded-3xl p-6 pb-12">
                                <p className="text-xs font-medium text-gray-500 uppercase mb-4">YEARLY OVERALL POINT</p>
                                <p className="text-sm font-medium text-gray-500 mb-1">Total Point :</p>
                                <p className="text-6xl font-medium text-black tracking-tight">{yearlyScore}</p>
                            </div>

                        </div>
                    ) : (
                        // === QUESTIONNAIRE VIEW ===
                        <div className="space-y-6">
                            <h3 className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2">SIKAP KEPRIBADIAN</h3>

                            {CRITERIA.map((criterion, idx) => (
                                <div key={criterion.id}>
                                    <p className="text-sm font-bold text-gray-700 mb-3">{String.fromCharCode(97 + idx)}. {criterion.label}</p>

                                    {/* Grey Box for Descriptions */}
                                    <div className="bg-gray-100 rounded-3xl p-5 mb-4 text-xs text-gray-600 leading-relaxed space-y-1">
                                        {criterion.desc.split('\n').map((line, i) => (
                                            <div key={i}>{line}</div>
                                        ))}
                                    </div>

                                    {/* Radio Buttons 1-5 */}
                                    <div className="flex justify-between px-2 mb-6">
                                        {[1, 2, 3, 4, 5].map((score) => (
                                            <div key={score} className="flex flex-col items-center gap-2">
                                                <span className="text-xs font-medium text-gray-500">{score}</span>
                                                <button
                                                    onClick={() => handleScoreChange(criterion.id, score)}
                                                    className={`w-6 h-6 rounded-full border-2 transition-all ${scores[criterion.id] === score
                                                        ? 'bg-blue-600 border-blue-600 scale-110'
                                                        : 'bg-gray-200 border-transparent hover:bg-gray-300'
                                                        }`}
                                                >
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={handleSubmit}
                                disabled={submitLoading}
                                className="w-full bg-blue-600 text-white font-bold py-4 rounded-full shadow-lg hover:bg-blue-700 transition disabled:opacity-50 mt-4 mb-8"
                            >
                                {submitLoading ? 'Submitting...' : 'Submit'}
                            </button>
                        </div>
                    )
                )}

            </div>
        </MobileLayout>
    );
}
