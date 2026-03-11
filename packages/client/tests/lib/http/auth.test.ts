import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function importAuthModule() {
  vi.resetModules();
  return import('@/lib/http/auth');
}

describe('lib/http/auth', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'csrf_token=test-csrf-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return existing access token without refreshing', async () => {
    const auth = await importAuthModule();
    auth.setTokenAccessors({
      getAccessToken: () => 'access-token',
      isAuthenticated: () => true,
      onTokenRefreshed: vi.fn(),
      onAuthError: vi.fn(),
    });

    await expect(auth.ensureAccessToken()).resolves.toBe('access-token');
  });

  it('should return null when there is no token and no active session', async () => {
    const auth = await importAuthModule();
    auth.setTokenAccessors({
      getAccessToken: () => null,
      isAuthenticated: () => false,
      onTokenRefreshed: vi.fn(),
      onAuthError: vi.fn(),
    });

    await expect(auth.ensureAccessToken()).resolves.toBeNull();
  });

  it('should deduplicate concurrent refresh requests', async () => {
    const onTokenRefreshed = vi.fn();
    const onAuthError = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          tokens: { accessToken: 'fresh-token', refreshToken: '' },
          user: { id: 'user-1' },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const auth = await importAuthModule();
    auth.setTokenAccessors({
      getAccessToken: () => null,
      isAuthenticated: () => true,
      onTokenRefreshed,
      onAuthError,
    });

    const [first, second] = await Promise.all([auth.getOrRefreshToken(), auth.getOrRefreshToken()]);

    expect(first).toBe('fresh-token');
    expect(second).toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onTokenRefreshed).toHaveBeenCalledWith('fresh-token');
    expect(onAuthError).not.toHaveBeenCalled();
  });

  it('should clear auth state and throw AUTH_ERROR when refresh fails', async () => {
    const onAuthError = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });
    vi.stubGlobal('fetch', fetchMock);

    const auth = await importAuthModule();
    auth.setTokenAccessors({
      getAccessToken: () => null,
      isAuthenticated: () => true,
      onTokenRefreshed: vi.fn(),
      onAuthError,
    });

    await expect(auth.ensureAccessToken()).rejects.toMatchObject({
      code: 'AUTH_ERROR',
      message: 'Session expired. Please login again.',
    });
    expect(onAuthError).toHaveBeenCalledTimes(1);
  });
});
