type EvidenceUploadPayload = {
    message?: string;
    error_code?: string;
    reference_id?: string;
    task_id?: number | string;
    server_time?: string;
    start_at?: string | null;
    due_at?: string | null;
    errors?: Record<string, string[]>;
};

type EvidenceTaskContext = {
    task_id?: number | string;
    id?: number | string;
    start_at?: string | null;
    due_at?: string | null;
};

export class EvidenceUploadRequestError extends Error {
    status: number;
    payload: EvidenceUploadPayload;
    responseServerTime: string | null;

    constructor(message: string, status: number, payload: EvidenceUploadPayload, responseServerTime: string | null) {
        super(message);
        this.name = 'EvidenceUploadRequestError';
        this.status = status;
        this.payload = payload;
        this.responseServerTime = responseServerTime;
    }
}

const firstValidationMessage = (errors?: Record<string, string[]>) => {
    if (!errors) return null;

    for (const messages of Object.values(errors)) {
        if (Array.isArray(messages) && typeof messages[0] === 'string') return messages[0];
    }

    return null;
};

export const evidenceUploadErrorFromResponse = async (response: Response) => {
    const responseText = await response.text();
    let payload: EvidenceUploadPayload = {};

    try {
        payload = JSON.parse(responseText) as EvidenceUploadPayload;
    } catch {
        payload = {};
    }

    const message = payload.message
        || firstValidationMessage(payload.errors)
        || `Server menolak unggahan (HTTP ${response.status}).`;

    return new EvidenceUploadRequestError(
        message,
        response.status,
        payload,
        response.headers.get('Date'),
    );
};

const formatTime = (value: unknown) => {
    if (typeof value !== 'string' && !(value instanceof Date)) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'short',
    }).format(date);
};

export const formatEvidenceUploadError = (error: unknown, task?: EvidenceTaskContext | null) => {
    const requestError = error instanceof EvidenceUploadRequestError ? error : null;
    const payload = requestError?.payload || {};
    const fallbackMessage = error instanceof TypeError
        ? 'Tidak dapat terhubung ke server.'
        : error instanceof Error && error.message
            ? error.message
            : 'Tidak dapat terhubung ke server.';
    const message = payload.message || firstValidationMessage(payload.errors) || fallbackMessage;
    const code = payload.error_code || (requestError ? `HTTP_${requestError.status}` : 'NETWORK_ERROR');
    const taskId = payload.task_id || task?.task_id || task?.id;
    const serverTime = formatTime(payload.server_time || requestError?.responseServerTime);
    const startAt = formatTime(payload.start_at || task?.start_at);
    const dueAt = formatTime(payload.due_at || task?.due_at);

    const lines = [
        'Unggah bukti gagal.',
        `Alasan: ${message}`,
        `Kode: ${code}`,
    ];

    if (payload.reference_id) lines.push(`Referensi: ${payload.reference_id}`);
    if (taskId) lines.push(`Tugas: #${taskId}`);
    lines.push(`Waktu HP: ${formatTime(new Date())}`);
    if (serverTime) lines.push(`Waktu server: ${serverTime}`);
    if (code === 'TASK_NOT_STARTED' && startAt) lines.push(`Mulai: ${startAt}`);
    if (dueAt) lines.push(`Tenggat: ${dueAt}`);

    return lines.join('\n');
};
