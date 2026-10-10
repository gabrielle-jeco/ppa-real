export const dailyScoreColor = (score: number | null | undefined, available: boolean) => {
    if (!available || score === null || score === undefined) return 'text-gray-400';
    if (score > 90) return 'text-green-500';
    if (score >= 75) return 'text-yellow-400';
    return 'text-red-500';
};

export const formatDailyScoreDate = (date?: string | null) => {
    if (!date) return '-';

    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '-';

    return parsed.toLocaleDateString('id-ID');
};

export const dailyScoreAvailabilityLabel = (reason?: string | null) => {
    if (reason === 'non_working_day') return 'Hari bebas tugas';
    if (reason === 'attendance_missing') return 'Data absensi belum tersedia';
    if (reason === 'cashier_integration_pending') return 'Nilai kasir H+1 belum tersedia';
    return 'Nilai belum tersedia';
};
