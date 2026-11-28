export const INVALID_CREDENTIALS_MESSAGE = 'Username dan password yang Anda masukkan tidak sesuai';
export const RATE_LIMIT_FALLBACK_MESSAGE = 'Terlalu banyak percobaan masuk. Silakan coba lagi dalam satu menit.';
export const SERVER_ERROR_MESSAGE = 'Terjadi gangguan pada server. Silakan coba lagi beberapa saat lagi.';
export const NETWORK_ERROR_MESSAGE = 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda lalu coba lagi.';
export const LOGOUT_TIMEOUT_MS = 2500;

type StorageReaderWriter = Pick<Storage, 'getItem' | 'removeItem'>;
type FetchLike = typeof fetch;

export function clearStoredSession(storage: Pick<Storage, 'removeItem'> = localStorage): void {
    storage.removeItem('auth_token');
    storage.removeItem('user_data');
    storage.removeItem('session_expires_at');
}

export async function logoutSession(options?: {
    fetchImpl?: FetchLike;
    storage?: StorageReaderWriter;
    timeoutMs?: number;
}): Promise<void> {
    const storage = options?.storage ?? localStorage;
    const fetchImpl = options?.fetchImpl ?? fetch;
    const timeoutMs = options?.timeoutMs ?? LOGOUT_TIMEOUT_MS;
    const token = storage.getItem('auth_token');

    clearStoredSession(storage);

    if (!token) {
        return;
    }

    const controller = typeof AbortController !== 'undefined' && timeoutMs > 0
        ? new AbortController()
        : null;
    const timeoutId = controller
        ? setTimeout(() => {
            controller.abort();
        }, timeoutMs)
        : null;

    try {
        await fetchImpl('/api/logout', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
            keepalive: true,
            ...(controller ? { signal: controller.signal } : {}),
        });
    } catch {
        // Best-effort revocation: local session is already cleared.
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
    }
}

export function resolveLoginErrorMessage(
    status: number,
    payload: { message?: unknown } | null,
): string {
    if (status === 429) {
        const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
        return message !== '' ? message : RATE_LIMIT_FALLBACK_MESSAGE;
    }

    if (status >= 500) {
        return SERVER_ERROR_MESSAGE;
    }

    return INVALID_CREDENTIALS_MESSAGE;
}
