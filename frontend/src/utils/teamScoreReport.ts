export type ReportMode = 'daily' | 'monthly';

export type DailyFilter = {
    mode: 'daily';
    start: string;
    end: string;
};

export type MonthlyFilter = {
    mode: 'monthly';
    start: string;
    end: string;
};

export type TeamScoreFilter = DailyFilter | MonthlyFilter;

export type DailyMemberScore = {
    id: string;
    name: string;
    approved_tasks: number;
    unapproved_tasks: number;
    score: number | null;
    available_days: number;
};

export type MonthlyMemberScore = {
    id: string;
    name: string;
    task_score: number;
    attendance_score: number;
    evaluation_score: number;
    total_score: number;
};

export type TeamScoreMember = DailyMemberScore | MonthlyMemberScore;

export type DailyDetailRow = {
    date: string;
    attendance_status: string | null;
    approved_tasks: number;
    unapproved_tasks: number;
    score: number | null;
    available: boolean;
    unavailable_reason: 'attendance_missing' | 'non_working_day' | null;
};

export type MonthlyDetailRow = {
    month: string;
    task_score: number;
    attendance_score: number;
    evaluation_score: number;
    total_score: number;
    missing_attendance_dates: string[];
};

export type TeamScoreSummary = {
    mode: ReportMode;
    period: { start: string; end: string };
    members: TeamScoreMember[];
};

export type TeamScoreDetail = {
    mode: ReportMode;
    member: { id: string; name: string };
    period: { start: string; end: string };
    summary: Omit<DailyMemberScore, 'id' | 'name'> | Omit<MonthlyMemberScore, 'id' | 'name'>;
    rows: DailyDetailRow[] | MonthlyDetailRow[];
};

const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
    Accept: 'application/json',
});

export const toLocalDateInput = (date: Date) => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

export const previousMonthInput = () => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    return toLocalDateInput(date).slice(0, 7);
};

export const defaultDailyFilter = (): DailyFilter => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { mode: 'daily', start: toLocalDateInput(start), end: toLocalDateInput(end) };
};

export const defaultMonthlyFilter = (): MonthlyFilter => {
    const month = previousMonthInput();
    return { mode: 'monthly', start: month, end: month };
};

export const reportQuery = (filter: TeamScoreFilter) => {
    const params = new URLSearchParams(filter.mode === 'daily'
        ? { start_date: filter.start, end_date: filter.end }
        : { start_month: filter.start, end_month: filter.end });
    return params.toString();
};

export const validateTeamScoreFilter = (filter: TeamScoreFilter): string | null => {
    if (!filter.start || !filter.end || filter.start > filter.end) {
        return 'Periode selesai harus sama atau setelah periode mulai.';
    }

    if (filter.mode === 'daily') {
        if (filter.end > toLocalDateInput(new Date())) return 'Tanggal selesai tidak boleh melewati hari ini.';
        const start = new Date(`${filter.start}T00:00:00`);
        const end = new Date(`${filter.end}T00:00:00`);
        const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
        return days > 31 ? 'Rentang nilai harian maksimal 31 hari kalender.' : null;
    }

    if (filter.end > previousMonthInput()) return 'Laporan bulanan hanya tersedia untuk bulan yang sudah selesai.';
    const [startYear, startMonth] = filter.start.split('-').map(Number);
    const [endYear, endMonth] = filter.end.split('-').map(Number);
    const months = ((endYear - startYear) * 12) + endMonth - startMonth + 1;
    return months > 12 ? 'Rentang nilai bulanan maksimal 12 bulan.' : null;
};

async function apiError(response: Response) {
    try {
        const payload = await response.json();
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().find(Boolean)
            : null;
        return String(validationMessage || payload?.message || 'Laporan tidak dapat dimuat.');
    } catch {
        return 'Laporan tidak dapat dimuat.';
    }
}

export async function fetchTeamScoreSummary(filter: TeamScoreFilter): Promise<TeamScoreSummary> {
    const response = await fetch(`/api/supervisor/team-scores/${filter.mode}?${reportQuery(filter)}`, {
        headers: authHeaders(),
    });
    if (!response.ok) throw new Error(await apiError(response));
    return response.json();
}

export async function fetchTeamScoreDetail(filter: TeamScoreFilter, memberId: string): Promise<TeamScoreDetail> {
    const response = await fetch(`/api/supervisor/team-scores/${filter.mode}/${encodeURIComponent(memberId)}?${reportQuery(filter)}`, {
        headers: authHeaders(),
    });
    if (!response.ok) throw new Error(await apiError(response));
    return response.json();
}

export const formatScore = (value: number | null | undefined) => (
    value === null || value === undefined ? '-' : `${Number(value.toFixed(2))}%`
);

export const formatPeriod = (filter: TeamScoreFilter) => {
    if (filter.mode === 'daily') {
        const format = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric',
        });
        return `${format(filter.start)} - ${format(filter.end)}`;
    }

    const format = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString('id-ID', {
        month: 'long', year: 'numeric',
    });
    return `${format(filter.start)} - ${format(filter.end)}`;
};

