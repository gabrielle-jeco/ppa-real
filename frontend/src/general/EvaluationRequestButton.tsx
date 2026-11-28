import { BellRing } from 'lucide-react';

export default function EvaluationRequestButton({ pendingRequestCount, onOpenRequests }: { pendingRequestCount: number; onOpenRequests: () => void }) {
    return <button type="button" onClick={onOpenRequests} className="relative rounded-xl border border-purple-100 bg-purple-50 p-3 text-primary transition hover:bg-purple-100" title="Permintaan perpanjangan evaluasi">
                        <BellRing size={20} />
                        {pendingRequestCount > 0 && <span className="absolute -right-2 -top-2 min-w-[22px] rounded-full bg-red-500 px-1.5 py-1 text-center text-[10px] font-black text-white">{pendingRequestCount > 99 ? '99+' : pendingRequestCount}</span>}
                    </button>;
}
