import { Star } from 'lucide-react';
import { formatDisplayNumber } from './numberFormat';
import { dailyScoreAvailabilityLabel, dailyScoreColor, formatDailyScoreDate } from '../utils/dailyScore';

interface DesktopCrewCardData {
    id: string | number;
    name: string;
    role?: string;
    activity_percentage?: number | null;
    daily_score?: number | null;
    daily_score_available?: boolean;
    daily_score_unavailable_reason?: string | null;
    daily_score_date?: string | null;
}

interface DesktopCrewCardProps {
    crew: DesktopCrewCardData;
    index: number;
    selected: boolean;
    onSelect: (id: string) => void;
}

function displayRole(role?: string) {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'employee' || normalized === 'crew' || normalized === 'sc') return 'Karyawan';
    if (normalized === 'supervisor') return 'Supervisor';
    if (normalized === 'manager') return 'Manager';
    if (normalized === 'regional_manager') return 'Regional Manager';
    return role || 'Karyawan';
}

function progressColor(score: number) {
    if (score > 90) return 'bg-green-500';
    if (score > 75) return 'bg-yellow-400';
    return 'bg-red-500';
}

export default function DesktopCrewCard({ crew, index, selected, onSelect }: DesktopCrewCardProps) {
    const activityPercentage = Number(crew.activity_percentage || 0);

    return (
        <button
            type="button"
            onClick={() => onSelect(String(crew.id))}
            className={`relative w-full rounded-2xl border border-l-4 p-5 text-left shadow-sm transition-all ${selected
                ? 'border-transparent border-l-primary bg-white shadow-md ring-1 ring-gray-100'
                : 'border-gray-50 border-l-transparent bg-white hover:border-l-purple-200'
                }`}
            style={{ boxShadow: selected ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : '' }}
        >
            <div
                className={`absolute right-4 top-3 flex flex-col items-center ${dailyScoreColor(crew.daily_score, crew.daily_score_available === true)}`}
                title={crew.daily_score_available ? `Nilai harian ${crew.daily_score}` : dailyScoreAvailabilityLabel(crew.daily_score_unavailable_reason)}
            >
                <Star size={18} fill="currentColor" className="drop-shadow-sm" />
                <span className="mt-0.5 text-[10px] font-black">{crew.daily_score_available ? formatDisplayNumber(crew.daily_score, '0') : '-'}</span>
                <span className="whitespace-nowrap text-[8px] font-semibold text-gray-400">{formatDailyScoreDate(crew.daily_score_date)}</span>
            </div>

            <div className="mb-4 min-h-[42px] pr-16">
                <h3 className="text-sm font-bold text-gray-800">{index + 1}. {crew.name} - {displayRole(crew.role)}</h3>
            </div>

            <div className="space-y-2">
                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                        className={`h-3 rounded-full ${progressColor(activityPercentage)}`}
                        style={{ width: `${Math.min(100, Math.max(0, activityPercentage))}%` }}
                    />
                </div>
                <span className="block text-[10px] text-gray-400">Persentase Aktivitas - {formatDisplayNumber(activityPercentage, '0')}%</span>
            </div>
        </button>
    );
}
