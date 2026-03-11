import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireClick, fireInput, flushPromises, render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  resetPassword: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    navigate: mocks.navigate,
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock('@/api', () => ({
  emailApi: {
    sendCode: mocks.sendCode,
    verifyCode: mocks.verifyCode,
  },
  authApi: {
    resetPassword: mocks.resetPassword,
  },
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/auth/FormField', () => ({
  FormField: ({
    name,
    label,
    type = 'text',
    value,
    onChange,
    onBlur,
    disabled,
    errors = [],
    hint,
    showPasswordToggle,
    showPassword,
    onTogglePassword,
  }: {
    name: string;
    label: string;
    type?: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    disabled?: boolean;
    errors?: string[];
    hint?: string;
    showPasswordToggle?: boolean;
    showPassword?: boolean;
    onTogglePassword?: () => void;
  }) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        type={showPasswordToggle ? (showPassword ? 'text' : 'password') : type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
      />
      {showPasswordToggle && onTogglePassword ? (
        <button type="button" onClick={onTogglePassword}>
          toggle
        </button>
      ) : null}
      {errors[0] ? <div>{errors[0]}</div> : hint ? <div>{hint}</div> : null}
    </div>
  ),
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
      aria-label="verification-code"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    />
  ),
}));

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should keep the email when navigating back from code step', async () => {
    mocks.sendCode.mockResolvedValue({ success: true });

    const view = await render(<ForgotPasswordForm />);

    const emailInput = view.container.querySelector('#email') as HTMLInputElement | null;
    const sendButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('forgot.email.sendCode')
    );

    await fireInput(emailInput, 'user@example.com');
    await fireClick(sendButton ?? null);
    await flushPromises();

    expect(view.container.textContent).toContain('forgot.step.code.title');

    const backButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('common:back')
    );
    await fireClick(backButton ?? null);
    await flushPromises();

    const emailInputAfterBack = view.container.querySelector('#email') as HTMLInputElement | null;

    expect(view.container.textContent).toContain('forgot.step.email.title');
    expect(emailInputAfterBack?.value).toBe('user@example.com');

    await view.unmount();
  });

  it('should complete the reset password flow across all three steps', async () => {
    mocks.sendCode.mockResolvedValue({ success: true });
    mocks.verifyCode.mockResolvedValue({ verificationToken: 'verify-token-1' });
    mocks.resetPassword.mockResolvedValue({ success: true });

    const view = await render(<ForgotPasswordForm />);

    const emailInput = view.container.querySelector('#email') as HTMLInputElement | null;
    const sendButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('forgot.email.sendCode')
    );

    await fireInput(emailInput, 'reset@example.com');
    await fireClick(sendButton ?? null);
    await flushPromises();

    expect(mocks.sendCode).toHaveBeenCalledWith({
      email: 'reset@example.com',
      type: 'reset_password',
    });
    expect(view.container.textContent).toContain('forgot.step.code.title');

    const codeInput = view.container.querySelector(
      'input[aria-label="verification-code"]'
    ) as HTMLInputElement | null;
    await fireInput(codeInput, '123456');
    await flushPromises();

    expect(mocks.verifyCode).toHaveBeenCalledWith({
      email: 'reset@example.com',
      code: '123456',
      type: 'reset_password',
    });
    expect(view.container.textContent).toContain('forgot.step.password.title');

    const newPasswordInput = view.container.querySelector(
      '#newPassword'
    ) as HTMLInputElement | null;
    const confirmPasswordInput = view.container.querySelector(
      '#confirmPassword'
    ) as HTMLInputElement | null;
    const submitButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('forgot.password.submit')
    );

    await fireInput(newPasswordInput, 'Password123!');
    await fireInput(confirmPasswordInput, 'Password123!');
    await fireClick(submitButton ?? null);
    await flushPromises();

    expect(mocks.resetPassword).toHaveBeenCalledWith({
      email: 'reset@example.com',
      newPassword: 'Password123!',
      confirmPassword: 'Password123!',
      verificationToken: 'verify-token-1',
      logoutAllDevices: true,
    });
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/auth/login' });

    await view.unmount();
  });
});
