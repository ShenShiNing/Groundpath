import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthSnapshot: vi.fn(),
  clearAuthState: vi.fn(),
  ensureAccessToken: vi.fn(),
  redirect: vi.fn((payload: unknown) => payload),
}));

vi.mock('@/stores', () => ({
  getAuthSnapshot: mocks.getAuthSnapshot,
  clearAuthState: mocks.clearAuthState,
}));

vi.mock('@/lib/http', () => ({
  ensureAccessToken: mocks.ensureAccessToken,
}));

vi.mock('@tanstack/react-router', () => ({
  redirect: mocks.redirect,
}));

describe('auth.guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/chat' },
      writable: true,
    });
  });

  it('requireAuth should allow when access token exists', async () => {
    mocks.getAuthSnapshot.mockReturnValue({ accessToken: 'token', isAuthenticated: true });

    const { requireAuth } = await import('@/routes/guards/auth.guard');

    await expect(requireAuth()).resolves.toBeUndefined();
    expect(mocks.ensureAccessToken).not.toHaveBeenCalled();
  });

  it('requireAuth should refresh when session exists without access token', async () => {
    mocks.getAuthSnapshot.mockReturnValue({ accessToken: null, isAuthenticated: true });
    mocks.ensureAccessToken.mockResolvedValue('fresh-token');

    const { requireAuth } = await import('@/routes/guards/auth.guard');

    await expect(requireAuth()).resolves.toBeUndefined();
    expect(mocks.ensureAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.clearAuthState).not.toHaveBeenCalled();
  });

  it('requireAuth should clear auth and redirect to login when refresh fails', async () => {
    mocks.getAuthSnapshot.mockReturnValue({ accessToken: null, isAuthenticated: true });
    mocks.ensureAccessToken.mockRejectedValue(new Error('expired'));

    const { requireAuth } = await import('@/routes/guards/auth.guard');

    await expect(requireAuth()).rejects.toEqual({
      to: '/auth/login',
      search: { redirect: '/chat' },
    });
    expect(mocks.clearAuthState).toHaveBeenCalledTimes(1);
  });

  it('requireGuest should redirect authenticated users to dashboard', async () => {
    mocks.getAuthSnapshot.mockReturnValue({ accessToken: 'token', isAuthenticated: true });

    const { requireGuest } = await import('@/routes/guards/auth.guard');

    await expect(requireGuest()).rejects.toEqual({ to: '/dashboard' });
  });

  it('requireGuest should clear auth when refresh fails and allow guest access', async () => {
    mocks.getAuthSnapshot.mockReturnValue({ accessToken: null, isAuthenticated: true });
    mocks.ensureAccessToken.mockRejectedValue(new Error('expired'));

    const { requireGuest } = await import('@/routes/guards/auth.guard');

    await expect(requireGuest()).resolves.toBeUndefined();
    expect(mocks.clearAuthState).toHaveBeenCalledTimes(1);
  });
});
