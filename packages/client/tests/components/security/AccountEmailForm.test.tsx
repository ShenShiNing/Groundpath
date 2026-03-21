import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireClick, fireInput, flushPromises, render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  changeEmail: vi.fn(),
  setUser: vi.fn(),
  toastSuccess: vi.fn(),
}));

const authState = {
  user: {
    id: 'user-1',
    username: 'tester',
    email: 'current@example.com',
    avatarUrl: null,
    bio: null,
    status: 'active' as const,
    emailVerified: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  },
  setUser: mocks.setUser,
};

const userState = {
  changeEmail: mocks.changeEmail,
  isChangingEmail: false,
};

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    emailApi: {
      ...actual.emailApi,
      sendCode: mocks.sendCode,
      verifyCode: mocks.verifyCode,
    },
  };
});

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
  useUserStore: (selector: (state: typeof userState) => unknown) => selector(userState),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string, options?: { seconds?: number }) =>
      options?.seconds ? `${key}:${options.seconds}` : key,
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

import { AccountEmailForm } from '../../../src/components/security/AccountEmailForm';

describe('AccountEmailForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user.email = 'current@example.com';
    userState.isChangingEmail = false;
  });

  it('should send, verify, and submit a new email', async () => {
    mocks.sendCode.mockResolvedValue({
      message: 'sent',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    mocks.verifyCode.mockResolvedValue({
      verified: true,
      verificationToken: 'verified-change-email-token',
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    });
    mocks.changeEmail.mockResolvedValue({
      ...authState.user,
      email: 'fresh@example.com',
    });

    const view = await render(<AccountEmailForm />);

    await fireInput(
      view.container.querySelector<HTMLInputElement>('#newEmail'),
      'Fresh@Example.com'
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('email.sendCode')
      ) ?? null
    );
    await flushPromises();

    expect(mocks.sendCode).toHaveBeenCalledWith({
      email: 'fresh@example.com',
      type: 'change_email',
    });

    await fireInput(
      view.container.querySelector<HTMLInputElement>('[data-testid="verification-code-input"]'),
      '123456'
    );
    await flushPromises();

    expect(mocks.verifyCode).toHaveBeenCalledWith({
      email: 'fresh@example.com',
      code: '123456',
      type: 'change_email',
    });
    expect(mocks.verifyCode).toHaveBeenCalledTimes(1);
    expect(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('email.verifyCode')
      )
    ).toHaveProperty('disabled', true);

    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('email.submit')
      ) ?? null
    );
    await flushPromises();

    expect(mocks.changeEmail).toHaveBeenCalledWith({
      newEmail: 'fresh@example.com',
      verificationToken: 'verified-change-email-token',
    });
    expect(mocks.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'fresh@example.com' })
    );

    await view.unmount();
  });

  it('should show localized rate limit message when send code is throttled', async () => {
    mocks.sendCode.mockRejectedValue({
      response: {
        data: {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many email requests, please try again later',
            details: { retryAfter: 42 },
          },
        },
      },
    });

    const view = await render(<AccountEmailForm />);

    await fireInput(
      view.container.querySelector<HTMLInputElement>('#newEmail'),
      'Fresh@Example.com'
    );
    await fireClick(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('email.sendCode')
      ) ?? null
    );
    await flushPromises();

    expect(view.container.textContent).toContain('email.rateLimitedSend:42');

    await view.unmount();
  });
});
