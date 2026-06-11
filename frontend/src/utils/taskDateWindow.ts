const startOfDay = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
};

export const toDateInputValue = (date: Date) => date.toLocaleDateString('en-CA');

export const getTaskWindowEndDate = (baseDate = new Date()) => {
    const base = startOfDay(baseDate);
    const cutoffMonth = base.getDate() <= 21 ? base.getMonth() : base.getMonth() + 1;
    return new Date(base.getFullYear(), cutoffMonth, 21);
};

export const isAfterTaskWindow = (date: Date, baseDate = new Date()) => (
    startOfDay(date).getTime() > getTaskWindowEndDate(baseDate).getTime()
);

export const isBeforeToday = (date: Date, baseDate = new Date()) => (
    startOfDay(date).getTime() < startOfDay(baseDate).getTime()
);

export const canAssignTaskOnDate = (date: Date, baseDate = new Date()) => (
    !isBeforeToday(date, baseDate) && !isAfterTaskWindow(date, baseDate)
);

export const clampToTaskWindow = (date: Date, baseDate = new Date()) => {
    const cutoff = getTaskWindowEndDate(baseDate);
    if (startOfDay(date).getTime() > cutoff.getTime()) {
        return cutoff;
    }
    return date;
};

export const getAvailableTaskMonths = (year: number, baseDate = new Date()) => {
    const cutoff = getTaskWindowEndDate(baseDate);
    if (year < cutoff.getFullYear()) {
        return Array.from({ length: 12 }, (_, i) => i);
    }
    if (year === cutoff.getFullYear()) {
        return Array.from({ length: cutoff.getMonth() + 1 }, (_, i) => i);
    }
    return [];
};

export const getAvailableTaskYears = (startYear = 2024, baseDate = new Date()) => {
    const cutoffYear = getTaskWindowEndDate(baseDate).getFullYear();
    return Array.from({ length: cutoffYear - startYear + 1 }, (_, i) => startYear + i);
};
