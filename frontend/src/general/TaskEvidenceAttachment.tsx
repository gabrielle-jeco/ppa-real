import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { downloadAssignmentFile, taskHeaders } from '../utils/managerAssignments';
import type { AssignmentEvidence } from '../utils/managerAssignments';

const MAX_CACHED_BLOBS = 40;
const evidenceBlobCache = new Map<string, string>();
const inflightEvidenceFetches = new Map<string, Promise<string>>();

function rememberBlobUrl(cacheKey: string, blobUrl: string) {
    if (evidenceBlobCache.has(cacheKey)) {
        evidenceBlobCache.delete(cacheKey);
    } else if (evidenceBlobCache.size >= MAX_CACHED_BLOBS) {
        const oldestKey = evidenceBlobCache.keys().next().value;
        if (oldestKey !== undefined) {
            const oldestUrl = evidenceBlobCache.get(oldestKey);
            if (oldestUrl) URL.revokeObjectURL(oldestUrl);
            evidenceBlobCache.delete(oldestKey);
        }
    }
    evidenceBlobCache.set(cacheKey, blobUrl);
}

function loadEvidenceBlobUrl(cacheKey: string, url: string): Promise<string> {
    const cached = evidenceBlobCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    const inflight = inflightEvidenceFetches.get(cacheKey);
    if (inflight) return inflight;

    const request = fetch(url, { headers: taskHeaders() })
        .then((response) => {
            if (!response.ok) throw new Error('Gagal memuat foto.');
            return response.blob();
        })
        .then((blob) => {
            const blobUrl = URL.createObjectURL(blob);
            rememberBlobUrl(cacheKey, blobUrl);
            return blobUrl;
        })
        .finally(() => {
            inflightEvidenceFetches.delete(cacheKey);
        });

    inflightEvidenceFetches.set(cacheKey, request);
    return request;
}

export default function TaskEvidenceAttachment({
    taskId,
    evidence,
    mobile = false,
    presentation = 'attachment',
}: {
    taskId: number;
    evidence: AssignmentEvidence;
    mobile?: boolean;
    presentation?: 'attachment' | 'thumbnail' | 'preview' | 'desktop-preview';
}) {
    const url = `/api/manager/tasks/${taskId}/evidences/${evidence.id}/download`;
    const spreadsheet = /\.xlsx$/i.test(evidence.file_path);
    const cacheKey = `${localStorage.getItem('auth_token') || ''}:${url}`;
    const [src, setSrc] = useState(() => (spreadsheet ? '' : evidenceBlobCache.get(cacheKey) || ''));
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (spreadsheet) return;
        const cached = evidenceBlobCache.get(cacheKey);
        if (cached) {
            setSrc(cached);
            setError('');
            return;
        }

        let active = true;
        setSrc('');
        setError('');

        loadEvidenceBlobUrl(cacheKey, url)
            .then((blobUrl) => {
                if (active) setSrc(blobUrl);
            })
            .catch((err) => {
                if (active) setError(err instanceof Error ? err.message : 'Gagal memuat foto.');
            });

        return () => {
            active = false;
        };
    }, [cacheKey, url, spreadsheet]);

    if (presentation !== 'attachment') {
        return (
            <div className={`w-full h-full flex items-center justify-center ${presentation === 'preview' ? 'bg-gray-100' : ''}`}>
                {spreadsheet ? (
                    <div className={`flex flex-col items-center gap-2 ${mobile ? 'text-blue-600' : 'text-primary'}`}>
                        <FileSpreadsheet size={presentation === 'thumbnail' ? 24 : 56} />
                        {(presentation === 'preview' || presentation === 'desktop-preview') && (
                            <span className="text-sm font-bold">Bukti XLSX</span>
                        )}
                        {presentation === 'desktop-preview' && (
                            <button
                                type="button"
                                className="flex items-center gap-2 text-xs font-bold text-primary disabled:opacity-50"
                                disabled={busy}
                                onClick={async () => {
                                    setBusy(true);
                                    setError('');
                                    try {
                                        await downloadAssignmentFile(url, `bukti-${evidence.id}.xlsx`);
                                    } catch (err) {
                                        setError(err instanceof Error ? err.message : 'Unduhan gagal.');
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            >
                                <Download size={14} />
                                Unduh bukti
                            </button>
                        )}
                        {error && <span role="alert" className="text-xs text-red-500">{error}</span>}
                    </div>
                ) : src ? (
                    <img
                        src={src}
                        alt={`Bukti percobaan ${evidence.attempt_no}`}
                        className={`w-full h-full ${presentation === 'desktop-preview' ? 'object-contain' : 'object-cover'} transition-opacity duration-300`}
                    />
                ) : (
                    <span role={error ? 'alert' : 'status'} className="px-2 text-center text-xs text-gray-400">
                        {error || 'Memuat foto...'}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-2 rounded-xl border border-gray-100 p-3">
            {spreadsheet ? (
                <div className={`flex items-center gap-2 ${mobile ? 'text-blue-600' : 'text-primary'}`}>
                    <FileSpreadsheet /> Bukti XLSX
                </div>
            ) : src ? (
                <a href={src} target="_blank" rel="noreferrer">
                    <img src={src} alt={`Bukti percobaan ${evidence.attempt_no}`} className="max-h-72 w-full rounded-xl object-contain" />
                </a>
            ) : (
                <p className="text-xs text-gray-400">Memuat foto...</p>
            )}
            {spreadsheet && (
                <button
                    type="button"
                    className={`flex items-center gap-2 text-xs font-bold disabled:opacity-50 ${mobile ? 'text-blue-600' : 'text-primary'}`}
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        setError('');
                        try {
                            await downloadAssignmentFile(url, `bukti-${evidence.id}.xlsx`);
                        } catch (err) {
                            setError(err instanceof Error ? err.message : 'Unduhan gagal.');
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <Download size={14} />
                    Unduh bukti
                </button>
            )}
            {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        </div>
    );
}
