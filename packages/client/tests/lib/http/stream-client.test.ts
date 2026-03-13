import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  t: vi.fn((key: string) => `translated:${key}`),
  getOrRefreshToken: vi.fn(),
  hasRefreshToken: vi.fn(),
  ensureAccessToken: vi.fn(),
  buildHeaders: vi.fn(() => ({ Authorization: 'Bearer token' })),
  extractResponseError: vi.fn(),
}));

vi.mock('@/i18n/i18n', () => ({
  default: {
    t: mocks.t,
  },
}));

vi.mock('@/lib/http/auth', () => ({
  getOrRefreshToken: mocks.getOrRefreshToken,
  hasRefreshToken: mocks.hasRefreshToken,
  ensureAccessToken: mocks.ensureAccessToken,
}));

vi.mock('@/lib/http/headers', () => ({
  buildHeaders: mocks.buildHeaders,
}));

vi.mock('@/lib/http/error', () => ({
  extractResponseError: mocks.extractResponseError,
}));

import { fetchStreamWithAuth } from '../../../src/lib/http/stream-client';

function createReader() {
  return {
    read: vi.fn(),
    releaseLock: vi.fn(),
    cancel: vi.fn(),
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

function createStreamResponse(options: { status?: number; ok?: boolean; reader?: unknown }) {
  const reader = options.reader;
  return {
    status: options.status ?? 200,
    ok: options.ok ?? true,
    body:
      reader === undefined
        ? undefined
        : {
            getReader: () => reader,
          },
  } as Response;
}

describe('fetchStreamWithAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasRefreshToken.mockReturnValue(false);
    mocks.ensureAccessToken.mockResolvedValue('access-token');
    mocks.getOrRefreshToken.mockResolvedValue('refreshed-token');
    mocks.extractResponseError.mockResolvedValue({
      code: 'SERVER_ERROR',
      message: 'server failed',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should return the stream reader when the request succeeds', async () => {
    const reader = createReader();
    vi.mocked(fetch).mockResolvedValue(createStreamResponse({ reader }));

    const result = await fetchStreamWithAuth(
      '/api/chat',
      { method: 'POST' },
      {
        getAccessToken: () => 'token-1',
      }
    );

    expect(mocks.ensureAccessToken).not.toHaveBeenCalled();
    expect(mocks.buildHeaders).toHaveBeenCalledWith('token-1');
    expect(result).toEqual({ ok: true, reader });
  });

  it('should proactively refresh before the first request when a refresh token exists', async () => {
    const reader = createReader();
    mocks.hasRefreshToken.mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(createStreamResponse({ reader }));

    const result = await fetchStreamWithAuth(
      '/api/chat',
      { method: 'POST' },
      {
        getAccessToken: () => null,
      }
    );

    expect(mocks.ensureAccessToken).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, reader });
  });

  it('should refresh once after a 401 and retry successfully', async () => {
    const reader = createReader();
    mocks.hasRefreshToken.mockReturnValue(true);
    vi.mocked(fetch)
      .mockResolvedValueOnce(createStreamResponse({ status: 401, ok: false }))
      .mockResolvedValueOnce(createStreamResponse({ reader }));

    const result = await fetchStreamWithAuth(
      '/api/chat',
      { method: 'POST' },
      {
        getAccessToken: () => 'token-1',
      }
    );

    expect(mocks.getOrRefreshToken).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, reader });
  });

  it('should map empty bodies and abort errors into stable client errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createStreamResponse({ reader: undefined }));

    const noBody = await fetchStreamWithAuth(
      '/api/chat',
      { method: 'POST' },
      {
        getAccessToken: () => 'token-1',
      }
    );

    expect(noBody).toEqual({
      ok: false,
      error: { code: 'NO_BODY', message: 'translated:stream.noBody' },
    });

    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetch).mockRejectedValueOnce(abortError);

    const aborted = await fetchStreamWithAuth(
      '/api/chat',
      { method: 'POST' },
      {
        getAccessToken: () => 'token-1',
      }
    );

    expect(aborted).toEqual({
      ok: false,
      error: { code: 'ABORTED', message: 'translated:stream.aborted' },
    });
  });

  it('should surface extracted server errors and refresh failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(createStreamResponse({ status: 500, ok: false }));

    const serverError = await fetchStreamWithAuth(
      '/api/chat',
      { method: 'POST' },
      {
        getAccessToken: () => 'token-1',
      }
    );

    expect(serverError).toEqual({
      ok: false,
      error: { code: 'SERVER_ERROR', message: 'server failed' },
    });

    mocks.hasRefreshToken.mockReturnValue(true);
    mocks.getOrRefreshToken.mockRejectedValueOnce(new Error('refresh failed'));
    vi.mocked(fetch).mockResolvedValueOnce(createStreamResponse({ status: 401, ok: false }));

    const authError = await fetchStreamWithAuth(
      '/api/chat',
      { method: 'POST' },
      {
        getAccessToken: () => 'token-1',
      }
    );

    expect(authError).toEqual({
      ok: false,
      error: { code: 'AUTH_ERROR', message: 'translated:stream.sessionExpired' },
    });
  });
});
