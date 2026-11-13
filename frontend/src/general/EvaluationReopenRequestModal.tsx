import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface EvaluationReopenRequestModalProps {
    open: boolean;
    crewId: string;
    crewName: string;
    onClose: () => void;
    onSuccess: () => void;
}

export default function EvaluationReopenRequestModal({ open, crewId, crewName, onClose, onSuccess }: EvaluationReopenRequestModalProps) {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    if (!open) return null;

    const close = () => {
        setReason('');
        onClose();
    };

    const submit = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/evaluations/reopen-requests/${crewId}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reason: reason.trim() || null }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message || payload?.errors?.request?.[0] || 'Permintaan tidak dapat dikirim.');
            onSuccess();
            close();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Permintaan tidak dapat dikirim.');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="w-full rounded-t-3xl bg-white p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 sm:max-w-md sm:rounded-3xl sm:zoom-in-95">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Ajukan Perpanjangan</h2>
                        <p className="mt-1 text-xs text-gray-500">Evaluasi {crewName} - maksimal 3 pengajuan per periode.</p>
                    </div>
                    <button type="button" onClick={close} className="rounded-full p-2 text-gray-400 hover:bg-gray-100"><X size={19} /></button>
                </div>
                <label className="mt-5 block text-xs font-black text-gray-600">Alasan <span className="font-medium text-gray-400">(opsional)</span></label>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={2000} placeholder="Tambahkan alasan bila diperlukan..." className="mt-2 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-purple-100" />
                <button type="button" disabled={saving} onClick={submit} className="mt-5 w-full rounded-2xl bg-primary py-3.5 text-sm font-black text-white shadow-lg disabled:opacity-50">{saving ? 'Mengirim...' : 'Kirim Permintaan'}</button>
            </div>
        </div>,
        document.body,
    );
}
