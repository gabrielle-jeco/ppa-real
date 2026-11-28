import test from 'node:test';
import assert from 'node:assert/strict';
import {
    INVALID_CREDENTIALS_MESSAGE,
    RATE_LIMIT_FALLBACK_MESSAGE,
    SERVER_ERROR_MESSAGE,
    clearStoredSession,
    logoutSession,
    resolveLoginErrorMessage,
} from '../src/utils/authSession.ts';

function createMemoryStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        removeItem: (key) => {
            store.delete(key);
        },
        snapshot: () => Object.fromEntries(store.entries()),
    };
}

test('clearStoredSession removes auth_token, user_data, and session_expires_at only', () => {
    const storage = createMemoryStorage({
        auth_token: 'tok-1',
        user_data: '{"username":"100"}',
        session_expires_at: '2026-12-01T00:00:00Z',
        presence_device_key: 'dev-1',
    });

    clearStoredSession(storage);

    assert.deepEqual(storage.snapshot(), { presence_device_key: 'dev-1' });
});

test('logoutSession revokes token via POST /api/logout and clears session storage', async () => {
    const storage = createMemoryStorage({
        auth_token: 'tok-abc',
        user_data: '{"username":"100"}',
        session_expires_at: '2026-12-01T00:00:00Z',
    });
    const calls = [];

    await logoutSession({
        storage,
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return new Response(null, { status: 200 });
        },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/logout');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-abc');
    assert.equal(calls[0].init.headers.Accept, 'application/json');
    assert.equal(calls[0].init.keepalive, true);
    assert.deepEqual(storage.snapshot(), {});
});

test('logoutSession clears local session even when backend revocation rejects', async () => {
    const storage = createMemoryStorage({
        auth_token: 'tok-fail',
        user_data: '{"username":"100"}',
        session_expires_at: '2026-12-01T00:00:00Z',
    });

    await logoutSession({
        storage,
        fetchImpl: async () => {
            throw new Error('network down');
        },
    });

    assert.deepEqual(storage.snapshot(), {});
});

test('logoutSession skips fetch when no auth_token is present and clears stale keys', async () => {
    const storage = createMemoryStorage({
        user_data: '{"username":"100"}',
        session_expires_at: '2026-12-01T00:00:00Z',
    });
    let called = false;

    await logoutSession({
        storage,
        fetchImpl: async () => {
            called = true;
            return new Response(null, { status: 200 });
        },
    });

    assert.equal(called, false);
    assert.deepEqual(storage.snapshot(), {});
});

test('logoutSession aborts stalled logout request after timeout and clears local session', async () => {
    const storage = createMemoryStorage({
        auth_token: 'tok-stalled',
        user_data: '{"username":"100"}',
        session_expires_at: '2026-12-01T00:00:00Z',
    });
    let signalWasProvided = false;
    let aborted = false;
    let storageClearedBeforeFetch = false;

    const start = Date.now();
    await logoutSession({
        storage,
        timeoutMs: 30,
        fetchImpl: (_url, init) => {
            signalWasProvided = Boolean(init?.signal);
            storageClearedBeforeFetch = Object.keys(storage.snapshot()).length === 0;
            return new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    aborted = true;
                    reject(new DOMException('The operation was aborted.', 'AbortError'));
                }, { once: true });
            });
        },
    });
    const elapsedMs = Date.now() - start;

    assert.equal(signalWasProvided, true);
    assert.equal(aborted, true);
    assert.equal(storageClearedBeforeFetch, true);
    assert.deepEqual(storage.snapshot(), {});
    assert.equal(elapsedMs < 1000, true);
});

test('resolveLoginErrorMessage preserves generic 401/422, surfaces 429, and distinguishes 5xx', () => {
    assert.equal(
        resolveLoginErrorMessage(401, { message: 'Akun tidak aktif.' }),
        INVALID_CREDENTIALS_MESSAGE,
    );
    assert.equal(
        resolveLoginErrorMessage(422, { message: 'The username field is invalid.' }),
        INVALID_CREDENTIALS_MESSAGE,
    );
    assert.equal(
        resolveLoginErrorMessage(429, { message: 'Terlalu banyak percobaan masuk. Tunggu 1 menit.' }),
        'Terlalu banyak percobaan masuk. Tunggu 1 menit.',
    );
    assert.equal(
        resolveLoginErrorMessage(429, null),
        RATE_LIMIT_FALLBACK_MESSAGE,
    );
    assert.equal(
        resolveLoginErrorMessage(503, { message: 'SQLSTATE[08006] connection refused' }),
        SERVER_ERROR_MESSAGE,
    );
});
