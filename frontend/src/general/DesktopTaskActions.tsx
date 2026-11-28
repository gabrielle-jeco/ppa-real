interface Props {
    canAssign: boolean;
    bulkEnabled?: boolean;
    busy?: boolean;
    onIndividual: () => void;
    onBulk: () => void;
}

export default function DesktopTaskActions({ canAssign, bulkEnabled = true, busy = false, onIndividual, onBulk }: Props) {
    return <div className="relative mb-3 grid gap-2" style={{ gridTemplateColumns: bulkEnabled ? 'repeat(auto-fit, minmax(min(100%, 128px), 1fr))' : '1fr' }}>
        <button onClick={onIndividual} disabled={busy || !canAssign}
            className={`h-12 border rounded-lg px-4 flex items-center justify-between text-xs font-semibold shadow-sm transition group ${canAssign ? 'bg-white border-gray-200 hover:border-primary text-gray-600 hover:text-primary cursor-pointer' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}>
            <span className="whitespace-nowrap">{canAssign ? 'Tambah Tugas' : 'Lihat Riwayat'}</span>
            {canAssign && <span className="bg-gray-100 group-hover:bg-purple-100 text-gray-500 group-hover:text-primary rounded-full w-5 h-5 shrink-0 flex items-center justify-center text-lg leading-none pb-0.5">+</span>}
        </button>
        {bulkEnabled && <button onClick={onBulk} disabled={busy || !canAssign}
            className={`h-12 px-4 rounded-lg text-xs font-bold shadow-sm transition whitespace-nowrap ${canAssign ? 'bg-primary text-white hover:bg-purple-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            Bulk Assignment
        </button>}
    </div>;
}
