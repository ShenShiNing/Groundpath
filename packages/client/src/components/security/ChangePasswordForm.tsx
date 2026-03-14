import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import type { AxiosError } from 'axios';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { KeyRound, Lock } from 'lucide-react';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { authApi, emailApi } from '@/api';
import { FormField } from '@/components/auth/FormField';
import { VerificationCodeInput } from '@/components/auth/VerificationCodeInput';
import { Button } from '@/components/ui/button';
import { useAuthStore, useUserStore } from '@/stores';
import {
  resolveEmailSendErrorMessage,
  resolveEmailSubmitErrorMessage,
  resolveEmailVerifyErrorMessage,
} from './errorMessage';
import { useExpiryCountdown } from './useExpiryCountdown';

const RESEND_COOLDOWN = 60;

function validateLocalizedPassword(value: string, t: (key: string) => string): string | undefined {
  if (value.length < 8) {
    return t('password.validation.minLength');
  }

  if (!/[a-zA-Z]/.test(value)) {
    return t('password.validation.letter');
  }

  if (!/[0-9]/.test(value)) {
    return t('password.validation.number');
  }

  return undefined;
}

function validatePasswordDifference(
  currentPassword: string,
  newPassword: string,
  t: (key: string) => string
): string | undefined {
  if (!currentPassword || !newPassword) {
    return undefined;
  }

  if (currentPassword === newPassword) {
    return t('password.sameAsCurrent');
  }

  return undefined;
}

interface ChangePasswordFormProps {
  onSuccess?: () => void;
}

export function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps) {
  const { t } = useTranslation('security');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const changePassword = useUserStore((s) => s.changePassword);
  const isChangingPassword = useUserStore((s) => s.isChangingPassword);
  const hasPassword = user?.hasPassword !== false;
  const [error, setError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [code, setCode] = useState('');
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationExpiresAt, setVerificationExpiresAt] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const hasAutoVerified = useRef(false);
  const codeRemainingSeconds = useExpiryCountdown(
    codeExpiresAt,
    useCallback(() => {
      setCodeExpiresAt(null);
      setError((current) => current ?? t('password.setup.codeExpired'));
    }, [t])
  );
  const verificationRemainingSeconds = useExpiryCountdown(
    verificationExpiresAt,
    useCallback(() => {
      setVerificationToken('');
      setVerificationExpiresAt(null);
      hasAutoVerified.current = false;
      setError((current) => current ?? t('password.setup.verificationExpired'));
    }, [t])
  );
  const hasActiveVerification = verificationToken.length > 0 && verificationRemainingSeconds > 0;

  const form = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        if (hasPassword) {
          await changePassword({
            oldPassword: value.currentPassword,
            newPassword: value.newPassword,
            confirmPassword: value.confirmPassword,
          });
          toast.success(t('password.changed'));
          clearAuth();
          onSuccess?.();
          await router.navigate({ to: '/auth/login' });
          return;
        }

        if (!user?.email) {
          setError(t('password.setup.emailMissing'));
          return;
        }

        if (!verificationToken) {
          setError(t('password.setup.verificationRequired'));
          return;
        }

        await authApi.resetPassword({
          email: user.email,
          newPassword: value.newPassword,
          confirmPassword: value.confirmPassword,
          verificationToken,
          logoutAllDevices: false,
        });

        if (user) {
          setUser({
            ...user,
            hasPassword: true,
          });
        }

        setCode('');
        setCodeExpiresAt(null);
        setVerificationToken('');
        setVerificationExpiresAt(null);
        setResendCooldown(0);
        hasAutoVerified.current = false;
        toast.success(t('password.setup.success'));
        onSuccess?.();
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        if (hasPassword) {
          const errorCode = axiosError.response?.data?.error?.code;
          setError(
            errorCode === AUTH_ERROR_CODES.INVALID_PASSWORD
              ? t('password.invalidCurrentPassword')
              : axiosError.response?.data?.error?.message || t('password.changeFailed')
          );
        } else {
          setError(resolveEmailSubmitErrorMessage(axiosError, t, 'password.setup'));
        }
      }
    },
  });

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendCooldown((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSendCode = useCallback(async () => {
    if (!user?.email) {
      setError(t('password.setup.emailMissing'));
      return;
    }

    setError(null);
    setIsSendingCode(true);

    try {
      const result = await emailApi.sendCode({
        email: user.email,
        type: 'reset_password',
      });
      setCode('');
      setCodeExpiresAt(result.expiresAt);
      setVerificationToken('');
      setVerificationExpiresAt(null);
      hasAutoVerified.current = false;
      setResendCooldown(RESEND_COOLDOWN);
      toast.success(t('password.setup.codeSent'));
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse>;
      setError(resolveEmailSendErrorMessage(axiosError, t, 'password.setup'));
    } finally {
      setIsSendingCode(false);
    }
  }, [t, user?.email]);

  const handleVerifyCode = useCallback(
    async (codeToVerify: string) => {
      if (hasActiveVerification) {
        return;
      }

      if (!user?.email) {
        setError(t('password.setup.emailMissing'));
        return;
      }

      if (codeToVerify.length !== 6) {
        setError(t('password.setup.codeInvalidLength'));
        return;
      }

      if (codeRemainingSeconds === 0) {
        setError(t('password.setup.codeExpired'));
        return;
      }

      setError(null);
      setIsVerifyingCode(true);

      try {
        const result = await emailApi.verifyCode({
          email: user.email,
          code: codeToVerify,
          type: 'reset_password',
        });
        setVerificationToken(result.verificationToken);
        setVerificationExpiresAt(result.expiresAt);
        setCodeExpiresAt(null);
        toast.success(t('password.setup.verified'));
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setVerificationToken('');
        setVerificationExpiresAt(null);
        hasAutoVerified.current = false;
        setError(resolveEmailVerifyErrorMessage(axiosError, t, 'password.setup'));
      } finally {
        setIsVerifyingCode(false);
      }
    },
    [codeRemainingSeconds, hasActiveVerification, t, user?.email]
  );

  const handleCodeChange = useCallback(
    (nextCode: string) => {
      setCode(nextCode);
      setError(null);
      setVerificationToken('');
      setVerificationExpiresAt(null);

      if (nextCode.length === 6 && !hasAutoVerified.current && !isVerifyingCode) {
        hasAutoVerified.current = true;
        void handleVerifyCode(nextCode);
      } else if (nextCode.length < 6) {
        hasAutoVerified.current = false;
      }
    },
    [handleVerifyCode, isVerifyingCode]
  );

  const showVerificationSection =
    !hasPassword &&
    (resendCooldown > 0 ||
      code.length > 0 ||
      codeExpiresAt !== null ||
      verificationToken.length > 0 ||
      verificationExpiresAt !== null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      {!hasPassword && (
        <div className="space-y-4 border-l-2 border-primary/20 pl-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('password.setup.codeLabel')}</p>
            <p className="text-sm text-muted-foreground">
              {t('password.setup.codeHint', { email: user?.email ?? '' })}
            </p>
            {codeRemainingSeconds > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('password.setup.codeExpiresIn', { seconds: codeRemainingSeconds })}
              </p>
            )}
            {verificationToken && verificationRemainingSeconds > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {t('password.setup.verifiedExpiresIn', { seconds: verificationRemainingSeconds })}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="cursor-pointer"
              onClick={() => void handleSendCode()}
              disabled={isSendingCode || isVerifyingCode}
            >
              <KeyRound className="mr-1 size-4" />
              {isSendingCode ? t('password.setup.sendingCode') : t('password.setup.sendCode')}
            </Button>
            {resendCooldown > 0 && (
              <span className="text-xs text-muted-foreground">
                {t('password.setup.resendAfter', { seconds: resendCooldown })}
              </span>
            )}
          </div>

          {showVerificationSection && (
            <div className="space-y-4">
              <VerificationCodeInput
                value={code}
                onChange={handleCodeChange}
                disabled={isVerifyingCode || hasActiveVerification}
                autoFocus
                error={!!error}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => void handleVerifyCode(code)}
                  disabled={code.length !== 6 || isVerifyingCode || hasActiveVerification}
                >
                  {isVerifyingCode
                    ? t('password.setup.verifyingCode')
                    : t('password.setup.verifyCode')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="cursor-pointer"
                  onClick={() => void handleSendCode()}
                  disabled={resendCooldown > 0 || isSendingCode}
                >
                  {t('password.setup.resend')}
                </Button>
              </div>

              {verificationToken && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  {t('password.setup.verified')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {hasPassword && (
        <form.Field
          name="currentPassword"
          validators={{
            onBlur: ({ value }) => {
              if (!value.trim()) {
                return t('password.currentRequired');
              }

              return undefined;
            },
          }}
        >
          {(field) => (
            <FormField
              name={field.name}
              label={t('password.currentLabel')}
              placeholder={t('password.currentPlaceholder')}
              icon={Lock}
              type="password"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              disabled={isChangingPassword}
              required
              errors={field.state.meta.errors as string[]}
              showPasswordToggle
              showPassword={showCurrentPassword}
              onTogglePassword={() => setShowCurrentPassword((previous) => !previous)}
            />
          )}
        </form.Field>
      )}

      <form.Field
        name="newPassword"
        validators={{
          onChangeListenTo: hasPassword ? ['currentPassword'] : undefined,
          onBlur: ({ value, fieldApi }) => {
            const localizedError = validateLocalizedPassword(value, t);
            if (localizedError) {
              return localizedError;
            }

            if (!hasPassword) {
              return undefined;
            }

            return validatePasswordDifference(
              fieldApi.form.getFieldValue('currentPassword'),
              value,
              t
            );
          },
          onChange: hasPassword
            ? ({ value, fieldApi }) =>
                validatePasswordDifference(fieldApi.form.getFieldValue('currentPassword'), value, t)
            : undefined,
        }}
      >
        {(field) => (
          <FormField
            name={field.name}
            label={t('password.newLabel')}
            placeholder={t('password.newPlaceholder')}
            icon={Lock}
            type="password"
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            disabled={isChangingPassword || isVerifyingCode}
            required
            errors={field.state.meta.errors as string[]}
            hint={t('password.newHint')}
            showPasswordToggle
            showPassword={showNewPassword}
            onTogglePassword={() => setShowNewPassword((previous) => !previous)}
          />
        )}
      </form.Field>

      <form.Field
        name="confirmPassword"
        validators={{
          onChangeListenTo: ['newPassword'],
          onChange: ({ value, fieldApi }) => {
            if (!value) {
              return t('password.confirmRequired');
            }

            const password = fieldApi.form.getFieldValue('newPassword');
            if (value !== password) {
              return t('password.mismatch');
            }

            return undefined;
          },
        }}
      >
        {(field) => (
          <FormField
            name={field.name}
            label={t('password.confirmLabel')}
            placeholder={t('password.confirmPlaceholder')}
            icon={Lock}
            type="password"
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            disabled={isChangingPassword || isVerifyingCode}
            required
            errors={field.state.meta.errors as string[]}
            showPasswordToggle
            showPassword={showConfirmPassword}
            onTogglePassword={() => setShowConfirmPassword((previous) => !previous)}
          />
        )}
      </form.Field>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            className="cursor-pointer"
            disabled={
              isSubmitting ||
              isChangingPassword ||
              isVerifyingCode ||
              (!hasPassword && !hasActiveVerification)
            }
          >
            {isSubmitting || isChangingPassword
              ? hasPassword
                ? t('password.submitting')
                : t('password.setup.submitting')
              : hasPassword
                ? t('password.submit')
                : t('password.setup.submit')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
