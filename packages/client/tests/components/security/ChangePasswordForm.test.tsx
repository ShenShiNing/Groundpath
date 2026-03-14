import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireClick, fireInput, flushPromises, render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  clearAuth: vi.fn(),
  setUser: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  resetPassword: vi.fn(),
}));

const authState = {
  user: {
    id: 'user-1',
    username: 'tester',
    email: 'tester@example.com',
    avatarUrl: null,
    bio: null,
    status: 'active' as const,
    emailVerified: true,
    hasPassword: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  },
  clearAuth: mocks.clearAuth,
  setUser: mocks.setUser,
};

const userState = {
  changePassword: mocks.changePassword,
  isChangingPassword: false,
};

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
  useUserStore: (selector: (state: typeof userState) => unknown) => selector(userState),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      resetPassword: mocks.resetPassword,
    },
    emailApi: {
      ...actual.emailApi,
      sendCode: mocks.sendCode,
      verifyCode: mocks.verifyCode,
    },
  };
});

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    navigate: mocks.navigate,
  }),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string, options?: { email?: string; seconds?: number }) =>
      options?.email
        ? `${key}:${options.email}`
        : options?.seconds
          ? `${key}:${options.seconds}`
          : key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/components/auth/VerificationCodeInput', () => ({
  VerificationCodeInput: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <input
      data-testid="verification-code-input"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import { ChangePasswordForm } from '../../../src/components/security/ChangePasswordForm';

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userState.isChangingPassword = false;
    authState.user.hasPassword = true;
    mocks.navigate.mockResolvedValue(undefined);
    mocks.changePassword.mockResolvedValue(undefined);
    mocks.resetPassword.mockResolvedValue({ message: 'ok' });
  });

  it('should submit password change and redirect to login when password already exists', async () => {
    const view = await render(<ChangePasswordForm />);

    await fireInput(
      view.container.querySelector<HTMLInputElement>('#currentPassword'),
      'OldPassword123'
    );
    await fireInput(
      view.container.querySelector<HTMLInputElement>('#newPassword'),
      'NewPassword456'
    );
    await fireInput(
      view.container.querySelector<HTMLInputElement>('#confirmPassword'),
      'NewPassword456'
    );

    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('password.submit')
      ) ?? null
    );
    await flushPromises();

    expect(mocks.changePassword).toHaveBeenCalledWith({
      oldPassword: 'OldPassword123',
      newPassword: 'NewPassword456',
      confirmPassword: 'NewPassword456',
    });
    expect(mocks.clearAuth).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/auth/login' });

    await view.unmount();
  });

  it('should set a local password after verifying email when the account has no password', async () => {
    authState.user.hasPassword = false;
    mocks.sendCode.mockResolvedValue({
      message: 'sent',
      expiresAt: '2026-03-14T12:00:00.000Z',
    });
    mocks.verifyCode.mockResolvedValue({
      verified: true,
      verificationToken: 'verified-reset-password-token',
    });

    const view = await render(<ChangePasswordForm />);

    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('password.setup.sendCode')
      ) ?? null
    );
    await flushPromises();

    expect(mocks.sendCode).toHaveBeenCalledWith({
      email: 'tester@example.com',
      type: 'reset_password',
    });

    await fireInput(
      view.container.querySelector<HTMLInputElement>('[data-testid="verification-code-input"]'),
      '123456'
    );
    await flushPromises();

    expect(mocks.verifyCode).toHaveBeenCalledWith({
      email: 'tester@example.com',
      code: '123456',
      type: 'reset_password',
    });

    await fireInput(
      view.container.querySelector<HTMLInputElement>('#newPassword'),
      'NewPassword456'
    );
    await fireInput(
      view.container.querySelector<HTMLInputElement>('#confirmPassword'),
      'NewPassword456'
    );

    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('password.setup.submit')
      ) ?? null
    );
    await flushPromises();

    expect(mocks.resetPassword).toHaveBeenCalledWith({
      email: 'tester@example.com',
      newPassword: 'NewPassword456',
      confirmPassword: 'NewPassword456',
      verificationToken: 'verified-reset-password-token',
      logoutAllDevices: false,
    });
    expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ hasPassword: true }));
    expect(mocks.clearAuth).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();

    await view.unmount();
  });
});
