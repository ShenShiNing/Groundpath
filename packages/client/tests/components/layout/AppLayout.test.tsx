import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireClick, flushPromises, render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  navigate: vi.fn(),
  clearAuth: vi.fn(),
  logClientError: vi.fn(),
}));

const authState = {
  isAuthenticated: true,
  clearAuth: mocks.clearAuth,
};

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      logout: mocks.logout,
    },
  };
});

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('@/lib/logger', () => ({
  logClientError: mocks.logClientError,
  logClientWarning: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { ns?: string }) => `${options?.ns ? `${options.ns}:` : ''}${key}`,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    navigate: mocks.navigate,
  }),
  useLocation: () => ({
    pathname: '/dashboard',
  }),
}));

vi.mock('@/components/layout/AppSidebar', () => ({
  AppSidebar: ({
    isCollapsed,
    onToggleCollapse,
    onLogout,
  }: {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onLogout: () => void;
  }) => (
    <div data-testid="app-sidebar" data-collapsed={isCollapsed ? 'yes' : 'no'}>
      <button type="button" onClick={onToggleCollapse}>
        toggle-sidebar
      </button>
      <button type="button" onClick={onLogout}>
        logout
      </button>
    </div>
  ),
}));

vi.mock('@/components/layout/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu">user-menu</div>,
}));

import { AppLayout } from '../../../src/components/layout/AppLayout';

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authState.isAuthenticated = true;
  });

  it('should render a simple shell without sidebar when unauthenticated', async () => {
    authState.isAuthenticated = false;

    const view = await render(
      <AppLayout>
        <div id="content">content</div>
      </AppLayout>
    );

    expect(view.container.querySelector('[data-testid="app-sidebar"]')).toBeNull();
    expect(view.container.querySelector('#content')?.textContent).toBe('content');

    await view.unmount();
  });

  it('should hydrate persisted collapse state and persist sidebar toggles', async () => {
    localStorage.setItem('groundpath.sidebar-collapsed', 'true');

    const view = await render(
      <AppLayout>
        <div>content</div>
      </AppLayout>
    );

    expect(
      view.container.querySelector('[data-testid="app-sidebar"]')?.getAttribute('data-collapsed')
    ).toBe('yes');

    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('toggle-sidebar')
      ) ?? null
    );

    expect(localStorage.getItem('groundpath.sidebar-collapsed')).toBe('false');
    expect(
      view.container.querySelector('[data-testid="app-sidebar"]')?.getAttribute('data-collapsed')
    ).toBe('no');

    await view.unmount();
  });

  it('should clear auth and navigate to login even when logout fails', async () => {
    mocks.logout.mockRejectedValue(new Error('logout failed'));

    const view = await render(
      <AppLayout>
        <div>content</div>
      </AppLayout>
    );

    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('logout')
      ) ?? null
    );
    await flushPromises();

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(mocks.logClientError).toHaveBeenCalledWith('AppLayout.handleLogout', expect.any(Error));
    expect(mocks.clearAuth).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/auth/login' });

    await view.unmount();
  });
});
