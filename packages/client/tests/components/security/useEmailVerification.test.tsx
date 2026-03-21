import { act, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { fireClick, fireInput, flushPromises, render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  toastSuccess: vi.fn(),
}));

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

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
  },
}));

import {
  type EmailVerificationFlow,
  useEmailVerification,
} from '../../../src/components/security/useEmailVerification';

const t = ((key: string, options?: { seconds?: number }) =>
  options?.seconds ? `${key}:${options.seconds}` : key) as unknown as TFunction<'security'>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function VerificationHarness({
  email,
  flow,
}: {
  email: string | undefined;
  flow: EmailVerificationFlow;
}) {
  const [error, setError] = useState<string | null>(null);
  const verification = useEmailVerification({ email, flow, t, setError });

  return (
    <div>
      <button
        type="button"
        data-testid="send-code"
        onClick={() => void verification.handleSendCode()}
      >
        send
      </button>
      <button
        type="button"
        data-testid="verify-code"
        onClick={() => void verification.handleVerifyCode(verification.code)}
      >
        verify
      </button>
      <button type="button" data-testid="manual-error" onClick={() => setError('manual error')}>
        set error
      </button>
      <input
        data-testid="code-input"
        value={verification.code}
        onChange={(event) => verification.handleCodeChange(event.target.value)}
      />
      <div data-testid="error">{error ?? ''}</div>
      <div data-testid="token">{verification.verificationToken}</div>
      <div data-testid="resend-cooldown">{verification.resendCooldown}</div>
      <div data-testid="has-active-verification">{String(verification.hasActiveVerification)}</div>
      <div data-testid="show-section">{String(verification.showVerificationSection)}</div>
    </div>
  );
}

describe('useEmailVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should preserve an existing error when the code expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T00:00:00.000Z'));
    mocks.sendCode.mockResolvedValue({
      message: 'sent',
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });

    const view = await render(
      <VerificationHarness email="tester@example.com" flow="passwordSetup" />
    );

    await fireClick(view.container.querySelector('[data-testid="send-code"]'));
    await flushPromises();
    await fireClick(view.container.querySelector('[data-testid="manual-error"]'));

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await flushPromises();

    expect(view.container.querySelector('[data-testid="error"]')?.textContent).toBe('manual error');

    await view.unmount();
  });

  it('should preserve an existing error when the verification token expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T00:00:00.000Z'));
    mocks.sendCode.mockResolvedValue({
      message: 'sent',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    mocks.verifyCode.mockResolvedValue({
      verified: true,
      verificationToken: 'verified-token',
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });

    const view = await render(
      <VerificationHarness email="tester@example.com" flow="passwordSetup" />
    );

    await fireClick(view.container.querySelector('[data-testid="send-code"]'));
    await flushPromises();
    await fireInput(
      view.container.querySelector<HTMLInputElement>('[data-testid="code-input"]'),
      '123456'
    );
    await flushPromises();
    await flushPromises();
    await fireClick(view.container.querySelector('[data-testid="manual-error"]'));

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await flushPromises();

    expect(view.container.querySelector('[data-testid="error"]')?.textContent).toBe('manual error');
    expect(view.container.querySelector('[data-testid="token"]')?.textContent).toBe('');

    await view.unmount();
  });

  it('should reset verification state when the email changes in emailChange flow', async () => {
    mocks.sendCode.mockResolvedValue({
      message: 'sent',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    mocks.verifyCode.mockResolvedValue({
      verified: true,
      verificationToken: 'verified-email-change-token',
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    });

    const view = await render(<VerificationHarness email="first@example.com" flow="emailChange" />);

    await fireClick(view.container.querySelector('[data-testid="send-code"]'));
    await flushPromises();

    expect(mocks.sendCode).toHaveBeenCalledWith({
      email: 'first@example.com',
      type: 'change_email',
    });

    await fireInput(
      view.container.querySelector<HTMLInputElement>('[data-testid="code-input"]'),
      '123456'
    );
    await flushPromises();
    await flushPromises();

    expect(mocks.verifyCode).toHaveBeenCalledWith({
      email: 'first@example.com',
      code: '123456',
      type: 'change_email',
    });
    expect(view.container.querySelector('[data-testid="token"]')?.textContent).toBe(
      'verified-email-change-token'
    );

    await view.rerender(<VerificationHarness email="second@example.com" flow="emailChange" />);

    expect(
      view.container.querySelector<HTMLInputElement>('[data-testid="code-input"]')?.value
    ).toBe('');
    expect(view.container.querySelector('[data-testid="token"]')?.textContent).toBe('');
    expect(view.container.querySelector('[data-testid="resend-cooldown"]')?.textContent).toBe('0');
    expect(
      view.container.querySelector('[data-testid="has-active-verification"]')?.textContent
    ).toBe('false');
    expect(view.container.querySelector('[data-testid="show-section"]')?.textContent).toBe('false');

    await view.unmount();
  });

  it('should derive reset_password requests from the passwordSetup flow', async () => {
    mocks.sendCode.mockResolvedValue({
      message: 'sent',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    mocks.verifyCode.mockResolvedValue({
      verified: true,
      verificationToken: 'verified-password-setup-token',
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    });

    const view = await render(
      <VerificationHarness email="tester@example.com" flow="passwordSetup" />
    );

    await fireClick(view.container.querySelector('[data-testid="send-code"]'));
    await flushPromises();
    await fireInput(
      view.container.querySelector<HTMLInputElement>('[data-testid="code-input"]'),
      '123456'
    );
    await flushPromises();
    await flushPromises();

    expect(mocks.sendCode).toHaveBeenCalledWith({
      email: 'tester@example.com',
      type: 'reset_password',
    });
    expect(mocks.verifyCode).toHaveBeenCalledWith({
      email: 'tester@example.com',
      code: '123456',
      type: 'reset_password',
    });

    await view.unmount();
  });

  it('should ignore stale send responses after the email changes', async () => {
    const deferredSendCode = createDeferred<{ message: string; expiresAt: string }>();
    mocks.sendCode.mockReturnValue(deferredSendCode.promise);

    const view = await render(<VerificationHarness email="first@example.com" flow="emailChange" />);

    await fireClick(view.container.querySelector('[data-testid="send-code"]'));
    await view.rerender(<VerificationHarness email="second@example.com" flow="emailChange" />);

    await act(async () => {
      deferredSendCode.resolve({
        message: 'sent',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
    });
    await flushPromises();

    expect(view.container.querySelector('[data-testid="resend-cooldown"]')?.textContent).toBe('0');
    expect(view.container.querySelector('[data-testid="show-section"]')?.textContent).toBe('false');

    await view.unmount();
  });
});
