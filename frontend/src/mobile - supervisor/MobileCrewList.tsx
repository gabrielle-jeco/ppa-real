import React, { useState, useEffect } from 'react';
import { Search, Star } from 'lucide-react';
import MobileLayout from './MobileLayout';
import { formatDisplayNumber } from '../general/numberFormat';
import { dailyScoreAvailabilityLabel, dailyScoreColor, formatDailyScoreDate } from '../utils/dailyScore';

interface Crew {
    id: string;
    name: string; // Changed from full_name to match API
    role: string; // Changed from role_name
    current_workstation: string | null; // Latest workstation from ActivityLog
    score: number; // Changed from performance_score
    daily_score: number | null;
    daily_score_date: string;
    daily_score_available: boolean;
    daily_score_unavailable_reason?: string | null;
    location: string;
}

interface MobileCrewListProps {
    onNavigate: (view: any, data?: any) => void;
}

const MobileCrewList: React.FC<MobileCrewListProps> = ({ onNavigate }) => {
    const [crews, setCrews] = useState<Crew[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchCrews();
    }, []);

    const fetchCrews = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/supervisor/crews', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCrews(data.crews || []);
            }
        } catch (error) {
            console.error("Gagal mengambil daftar karyawan", error);
        } finally {
            setLoading(false);
        }
    };

    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('id-ID');
    const filteredCrews = crews.filter(c =>
        String(c.name || '').toLocaleLowerCase('id-ID').includes(normalizedSearch) ||
        String(c.id || '').toLocaleLowerCase('id-ID').includes(normalizedSearch)
    );

    const getProgressBarColor = (score: number) => {
        if (score > 90) return 'bg-green-500';
        if (score >= 75.5) return 'bg-yellow-400';
        return 'bg-red-500';
    };

    return (
        <MobileLayout
            title="Karyawan"
            onBack={() => onNavigate('DASHBOARD')}
        >
            {/* Search Bar */}
            <div className="mb-6 relative">
                <div className="bg-white rounded-full shadow-sm border border-gray-100 flex items-center px-4 py-3">
                    <input
                        type="text"
                        placeholder="Cari nama atau NIK..."
                        className="flex-1 bg-transparent outline-none text-gray-700 placeholder-gray-400 text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Search size={20} className="text-blue-500" />
                </div>
            </div>

            {/* List Content */}
            <div className="space-y-4">
                {loading && (
                    <div className="text-center text-gray-400 py-10">Memuat karyawan...</div>
                )}

                {!loading && filteredCrews.length === 0 && (
                    <div className="text-center text-gray-400 py-10">Service crew tidak ditemukan.</div>
                )}

                {filteredCrews.map((crew, index) => {
                    const score = crew.score || 0;
                    const displayRole = crew.role === 'employee' ? 'Karyawan' : crew.role;

                    return (
                        <div
                            key={crew.id}
                            onClick={() => onNavigate('CREW_DETAIL', crew)}
                            className="bg-gray-100 rounded-2xl p-4 relative cursor-pointer active:scale-95 transition-transform border border-transparent hover:border-blue-200"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-medium text-gray-700 text-sm">
                                    {index + 1}. {crew.name} - <span className="text-gray-500 text-xs">{displayRole}</span>
                                </h3>
                                <div
                                    className={`flex shrink-0 flex-col items-center ${dailyScoreColor(crew.daily_score, crew.daily_score_available)}`}
                                    title={crew.daily_score_available ? `Nilai harian ${crew.daily_score}` : dailyScoreAvailabilityLabel(crew.daily_score_unavailable_reason)}
                                >
                                    <Star size={16} className="fill-current" />
                                    <span className="text-[10px] font-black">{crew.daily_score_available ? formatDisplayNumber(crew.daily_score, '0') : '-'}</span>
                                    <span className="whitespace-nowrap text-[8px] font-semibold text-gray-400">{formatDailyScoreDate(crew.daily_score_date)}</span>
                                </div>
                            </div>

                            <div className="w-full bg-white rounded-full h-3 mb-1">
                                <div
                                    className={`${getProgressBarColor(score)} h-3 rounded-full transition-all duration-500`}
                                    style={{ width: `${score}%` }}
                                ></div>
                            </div>

                            <p className="text-[10px] text-gray-500 font-medium">
                                Persentase Aktivitas - {formatDisplayNumber(score, '0')}%
                            </p>
                        </div>
                    );
                })}
            </div>
        </MobileLayout>
    );
};

export default MobileCrewList;
