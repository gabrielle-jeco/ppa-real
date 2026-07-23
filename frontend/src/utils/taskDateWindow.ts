const startOfDay = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
};

export const toDateInputValue = (date: Date) => date.toLocaleDateString('en-CA');

export const toDateFieldValue = (value: unknown, fallback = toDateInputValue(new Date())) => {
    if (!value) return fallback;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value.slice(0, 10);
    }

    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? fallback : toDateInputValue(date);
};

export const toTimeFieldValue = (value: unknown, fallback = '') => {
    if (!value) return fallback;
    if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) {
        return value.slice(0, 5);
    }

    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? fallback : date.toTimeString().slice(0, 5);
};

export const getTaskWindowEndDate = (baseDate = new Date()) => {
    const base = startOfDay(baseDate);
    base.setDate(base.getDate() + 6);
    return base;
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
