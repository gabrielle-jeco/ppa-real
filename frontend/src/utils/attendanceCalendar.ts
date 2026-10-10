export type AttendanceCalendarDay = {
    date: string;
    day: number;
    status_code: string | null;
    source?: string;
};

export function getAttendanceDay(calendar: AttendanceCalendarDay[] | undefined, date: Date) {
    if (!calendar) return null;

    const dateKey = date.toLocaleDateString('en-CA');
    return calendar.find((item) => item.date === dateKey) || null;
}

export function normalizeAttendanceStatus(status?: string | null) {
    const normalized = String(status || '').trim().toUpperCase();

    if (['H', 'HADIR', 'PRESENT', 'MASUK'].includes(normalized)) return 'H';
    if (['OP', 'OFF PENGGANTI', 'OFF_PENGGANTI', 'OFF-PENGGANTI'].includes(normalized)) return 'OP';
    if (['O', 'OFF', 'L', 'LIBUR', 'HOLIDAY'].includes(normalized)) return 'O';
    if (['CT', 'C', 'CUTI', 'LEAVE'].includes(normalized)) return 'CT';

    return normalized;
}

export function getAttendanceColor(status?: string | null, isFuture = false) {
    if (isFuture) return 'text-gray-300 cursor-not-allowed bg-transparent';

    switch (normalizeAttendanceStatus(status)) {
        case 'H':
            return 'bg-green-500 text-white shadow-sm';
        case 'O':
            return 'bg-gray-500 text-white shadow-sm';
        case 'OP':
            return 'bg-sky-500 text-white shadow-sm';
        case 'CT':
            return 'bg-purple-500 text-white shadow-sm';
        case 'T':
            return 'bg-yellow-400 text-white shadow-sm';
        case 'A':
            return 'bg-red-500 text-white shadow-sm';
        case 'S':
            return 'bg-blue-500 text-white shadow-sm';
        default:
            return 'bg-orange-100 text-gray-700';
    }
}
