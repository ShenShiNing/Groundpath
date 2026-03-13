import { beforeEach, describe, expect, it, vi } from 'vitest';

const authStoreMocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  registerWithCode: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  setTokenAccessors: vi.fn(),
  logClientError: vi.fn(),
}));

vi.mock('@/api', () => ({
  authApi: {
    login: authStoreMocks.login,
    register: authStoreMocks.register,
    registerWithCode: authStoreMocks.registerWithCode,
    logout: authStoreMocks.logout,
    logoutAll: authStoreMocks.logoutAll,
  },
  setTokenAccessors: authStoreMocks.setTokenAccessors,
}));

vi.mock('@/lib/logger', () => ({
  logClientError: authStoreMocks.logClientError,
  logClientWarning: vi.fn(),
}));

import { useAuthStore } from '@/stores/authStore';

function resetAuthStore() {
  localStorage.clear();
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
  });
}

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthStore();
  });

  it.each([
    {
      action: 'login',
      run: () => useAuthStore.getState().login('user@example.com', 'password'),
      mock: authStoreMocks.login,
      metadata: { email: 'user@example.com' },
    },
    {
      action: 'register',
      run: () =>
        useAuthStore.getState().register({
          username: 'tester',
          email: 'user@example.com',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        }),
      mock: authStoreMocks.register,
      metadata: { email: 'user@example.com' },
    },
    {
      action: 'registerWithCode',
      run: () =>
        useAuthStore.getState().registerWithCode({
          username: 'tester',
          email: 'user@example.com',
          password: 'Password123!',
          confirmPassword: 'Password123!',
          verificationToken: 'verified-token',
        }),
      mock: authStoreMocks.registerWithCode,
      metadata: { email: 'user@example.com' },
    },
  ])('logs %s failures and clears loading state', async ({ action, run, mock, metadata }) => {
    const error = new Error(`${action} failed`);
    mock.mockRejectedValue(error);

    await expect(run()).rejects.toBe(error);

    expect(authStoreMocks.logClientError).toHaveBeenCalledWith(
      `authStore.${action}`,
      error,
      metadata
    );
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('logs logout failures and still clears local auth state', async () => {
    const error = new Error('logout failed');
    authStoreMocks.logout.mockRejectedValue(error);
    useAuthStore.setState({
      user: { id: 'user-1', email: 'user@example.com', username: 'tester', avatarUrl: null },
      accessToken: 'access-token',
      isAuthenticated: true,
      isLoading: false,
    });

    await useAuthStore.getState().logout();

    expect(authStoreMocks.logClientError).toHaveBeenCalledWith('authStore.logout', error);
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('logs logoutAll failures and still clears local auth state', async () => {
    const error = new Error('logout all failed');
    authStoreMocks.logoutAll.mockRejectedValue(error);
    useAuthStore.setState({
      user: { id: 'user-1', email: 'user@example.com', username: 'tester', avatarUrl: null },
      accessToken: 'access-token',
      isAuthenticated: true,
      isLoading: false,
    });

    await useAuthStore.getState().logoutAll();

    expect(authStoreMocks.logClientError).toHaveBeenCalledWith('authStore.logoutAll', error);
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });
});
