import { useState } from 'react';
import type { FormEvent } from 'react';

export default function PaginationControls({ page, totalPages, onPageChange, disabled = false }: { page: number; totalPages: number; onPageChange: (page: number) => void; disabled?: boolean }) {
    const [jumpPage, setJumpPage] = useState('');
    const safeTotal = Math.max(totalPages, 1);
    const safePage = Math.min(Math.max(page, 1), safeTotal);

    const goToPage = (target: number) => {
        if (disabled || !Number.isInteger(target)) return;
        const nextPage = Math.min(Math.max(target, 1), safeTotal);
        if (nextPage !== safePage) onPageChange(nextPage);
    };

    const pageItems = (() => {
        if (safeTotal <= 7) return Array.from({ length: safeTotal }, (_, i) => i + 1);

        const items: Array<number | string> = [1];
        const start = Math.max(2, safePage - 1);
        const end = Math.min(safeTotal - 1, safePage + 1);

        if (start > 2) items.push('left-ellipsis');
        for (let current = start; current <= end; current++) items.push(current);
        if (end < safeTotal - 1) items.push('right-ellipsis');
        items.push(safeTotal);

        return items;
    })();

    const submitJump = (event: FormEvent) => {
        event.preventDefault();
        const target = Number(jumpPage);
        if (jumpPage.trim() && Number.isInteger(target)) goToPage(target);
        setJumpPage('');
    };

    return (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
                <button
                    type="button"
                    disabled={disabled || safePage <= 1}
                    onClick={() => goToPage(safePage - 1)}
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-30 hover:text-primary hover:border-primary transition"
                >
                    Sebelumnya
                </button>

                <div className="flex flex-shrink-0 items-center gap-1">
                    {pageItems.map((item) => typeof item === 'number' ? (
                        <button
                            type="button"
                            disabled={disabled}
                            aria-current={item === safePage ? 'page' : undefined}
                            key={item}
                            onClick={() => goToPage(item)}
                            className={`min-w-9 px-3 py-2 rounded-xl text-xs font-black transition ${item === safePage
                                ? 'bg-primary text-white shadow-md shadow-purple-100'
                                : 'bg-white border border-gray-200 text-gray-600 hover:text-primary hover:border-primary'
                                }`}
                        >
                            {item}
                        </button>
                    ) : (
                        <span key={item} className="px-2 text-xs font-black text-gray-400">...</span>
                    ))}
                </div>

                <button
                    type="button"
                    disabled={disabled || safePage >= safeTotal}
                    onClick={() => goToPage(safePage + 1)}
                    className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-30 hover:text-primary hover:border-primary transition"
                >
                    Berikutnya
                </button>
            </div>

            <form onSubmit={submitJump} className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400">Halaman {safePage} dari {safeTotal}</span>
                <input
                    aria-label="Ke halaman"
                    disabled={disabled}
                    type="number"
                    step={1}
                    min={1}
                    max={safeTotal}
                    value={jumpPage}
                    onChange={(event) => setJumpPage(event.target.value)}
                    placeholder="Ke"
                    className="w-20 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-purple-100"
                />
                <button type="submit" disabled={disabled || !jumpPage.trim()} className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-600 hover:text-primary hover:border-primary transition disabled:opacity-30">
                    Buka
                </button>
            </form>
        </div>
    );
}
