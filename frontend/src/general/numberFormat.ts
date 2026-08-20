const displayNumberFormatter = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

export function formatDisplayNumber(value: unknown, fallback = '-'): string {
    const numericValue = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : Number.NaN;

    return Number.isFinite(numericValue)
        ? displayNumberFormatter.format(numericValue)
        : fallback;
}

export function roundToDisplayPrecision(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
