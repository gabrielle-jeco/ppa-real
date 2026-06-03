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

export function getAttendanceColor(status?: string | null, isFuture = false) {
    if (isFuture) return 'text-gray-300 cursor-not-allowed bg-transparent';

    switch ((status || '').toUpperCase()) {
        case 'H':
            return 'bg-green-500 text-white shadow-sm';
        case 'T':
            return 'bg-yellow-400 text-white shadow-sm';
        case 'A':
            return 'bg-red-500 text-white shadow-sm';
        case 'S':
        case 'C':
        case 'L':
            return 'bg-gray-300 text-white';
        default:
            return 'bg-gray-100 text-gray-700';
    }
}
