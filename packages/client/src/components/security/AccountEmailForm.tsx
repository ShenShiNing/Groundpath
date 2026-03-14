import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { Mail } from 'lucide-react';
import { emailSchema } from '@knowledge-agent/shared/schemas';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { emailApi } from '@/api';
import { VerificationCodeInput } from '@/components/auth/VerificationCodeInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore, useUserStore } from '@/stores';
import {
  resolveEmailSendErrorMessage,
  resolveEmailSubmitErrorMessage,
  resolveEmailVerifyErrorMessage,
} from './errorMessage';
import { useExpiryCountdown } from './useExpiryCountdown';

const RESEND_COOLDOWN = 60;

function normalizeClientEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface AccountEmailFormProps {
  onSuccess?: () => void;
}

export function AccountEmailForm({ onSuccess }: AccountEmailFormProps) {
  const { t } = useTranslation('security');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const changeEmail = useUserStore((s) => s.changeEmail);
  const isChangingEmail = useUserStore((s) => s.isChangingEmail);
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationExpiresAt, setVerificationExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const hasAutoVerified = useRef(false);
  const codeRemainingSeconds = useExpiryCountdown(
    codeExpiresAt,
    useCallback(() => {
      setCodeExpiresAt(null);
      setError((current) => current ?? t('email.codeExpired'));
    }, [t])
  );
  const verificationRemainingSeconds = useExpiryCountdown(
    verificationExpiresAt,
    useCallback(() => {
      setVerificationToken('');
      setVerificationExpiresAt(null);
      hasAutoVerified.current = false;
      setError((current) => current ?? t('email.verificationExpired'));
    }, [t])
  );
  const hasActiveVerification = verificationToken.length > 0 && verificationRemainingSeconds > 0;

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendCooldown((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const resetVerificationState = useCallback(() => {
    setCode('');
    setCodeExpiresAt(null);
    setVerificationToken('');
    setVerificationExpiresAt(null);
    hasAutoVerified.current = false;
  }, []);

  const validateNewEmail = useCallback((): string | null => {
    const normalizedEmail = normalizeClientEmail(newEmail);
    const validationResult = emailSchema.safeParse(normalizedEmail);
    if (!validationResult.success) {
      return validationResult.error.issues[0]?.message ?? t('email.sendFailed');
    }

    if (normalizedEmail === normalizeClientEmail(user?.email ?? '')) {
      return t('email.sameEmail');
    }

    return null;
  }, [newEmail, t, user?.email]);

  const handleSendCode = useCallback(async () => {
    const validationError = validateNewEmail();
    if (validationError) {
      setError(validationError);
      return;
    }

    const normalizedEmail = normalizeClientEmail(newEmail);

    setError(null);
    setIsSendingCode(true);

    try {
      const result = await emailApi.sendCode({
        email: normalizedEmail,
        type: 'change_email',
      });
      setCode('');
      setVerificationToken('');
      setVerificationExpiresAt(null);
      hasAutoVerified.current = false;
      setCodeExpiresAt(result.expiresAt);
      setResendCooldown(RESEND_COOLDOWN);
      toast.success(t('email.codeSent'));
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse>;
      setError(resolveEmailSendErrorMessage(axiosError, t, 'email'));
    } finally {
      setIsSendingCode(false);
    }
  }, [newEmail, t, validateNewEmail]);

  const handleVerifyCode = useCallback(
    async (codeToVerify: string) => {
      if (hasActiveVerification) {
        return;
      }

      if (codeToVerify.length !== 6) {
        setError(t('email.codeInvalidLength'));
        return;
      }

      const validationError = validateNewEmail();
      if (validationError) {
        setError(validationError);
        return;
      }

      const normalizedEmail = normalizeClientEmail(newEmail);
      if (codeRemainingSeconds === 0) {
        setError(t('email.codeExpired'));
        return;
      }

      setError(null);
      setIsVerifyingCode(true);

      try {
        const result = await emailApi.verifyCode({
          email: normalizedEmail,
          code: codeToVerify,
          type: 'change_email',
        });
        setVerificationToken(result.verificationToken);
        setVerificationExpiresAt(result.expiresAt);
        setCodeExpiresAt(null);
        toast.success(t('email.verified'));
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setVerificationToken('');
        setVerificationExpiresAt(null);
        hasAutoVerified.current = false;
        setError(resolveEmailVerifyErrorMessage(axiosError, t, 'email'));
      } finally {
        setIsVerifyingCode(false);
      }
    },
    [codeRemainingSeconds, hasActiveVerification, newEmail, t, validateNewEmail]
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

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const validationError = validateNewEmail();
      if (validationError) {
        setError(validationError);
        return;
      }

      if (!verificationToken) {
        setError(t('email.verificationRequired'));
        return;
      }

      setError(null);

      try {
        const updatedUser = await changeEmail({
          newEmail: normalizeClientEmail(newEmail),
          verificationToken,
        });
        setUser(updatedUser);
        setNewEmail('');
        resetVerificationState();
        setResendCooldown(0);
        toast.success(t('email.updated'));
        onSuccess?.();
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(resolveEmailSubmitErrorMessage(axiosError, t, 'email'));
      }
    },
    [
      changeEmail,
      newEmail,
      onSuccess,
      resetVerificationState,
      setUser,
      t,
      validateNewEmail,
      verificationToken,
    ]
  );

  const showVerificationSection =
    resendCooldown > 0 ||
    code.length > 0 ||
    codeExpiresAt !== null ||
    verificationToken.length > 0 ||
    verificationExpiresAt !== null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="newEmail">{t('email.newLabel')}</Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="newEmail"
              type="email"
              placeholder={t('email.newPlaceholder')}
              className="pl-10"
              value={newEmail}
              onChange={(event) => {
                setNewEmail(event.target.value);
                setError(null);
                resetVerificationState();
              }}
              disabled={isSendingCode || isVerifyingCode || isChangingEmail}
              required
            />
          </div>
          <Button
            type="button"
            className="cursor-pointer sm:min-w-32"
            onClick={() => void handleSendCode()}
            disabled={isSendingCode || isVerifyingCode || isChangingEmail}
          >
            {isSendingCode ? t('email.sendingCode') : t('email.sendCode')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('email.hint')}</p>
      </div>

      {showVerificationSection && (
        <div className="space-y-4 border-l-2 border-border pl-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('email.codeLabel')}</p>
            <p className="text-sm text-muted-foreground">{t('email.codeHint')}</p>
            {codeRemainingSeconds > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('email.codeExpiresIn', { seconds: codeRemainingSeconds })}
              </p>
            )}
            {verificationToken && verificationRemainingSeconds > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {t('email.verifiedExpiresIn', { seconds: verificationRemainingSeconds })}
              </p>
            )}
          </div>

          <VerificationCodeInput
            value={code}
            onChange={handleCodeChange}
            disabled={isVerifyingCode || isChangingEmail || hasActiveVerification}
            autoFocus
            error={!!error}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => void handleVerifyCode(code)}
              disabled={
                code.length !== 6 || isVerifyingCode || isChangingEmail || hasActiveVerification
              }
            >
              {isVerifyingCode ? t('email.verifyingCode') : t('email.verifyCode')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="cursor-pointer"
              onClick={() => void handleSendCode()}
              disabled={resendCooldown > 0 || isSendingCode || isChangingEmail}
            >
              {resendCooldown > 0
                ? t('email.resendAfter', { seconds: resendCooldown })
                : t('email.resend')}
            </Button>
          </div>

          {verificationToken && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('email.verified')}</p>
          )}
        </div>
      )}

      {error && <div className="text-sm text-destructive">{error}</div>}

      <Button
        type="submit"
        className="cursor-pointer"
        disabled={!hasActiveVerification || isChangingEmail || isVerifyingCode}
      >
        {isChangingEmail ? t('email.submitting') : t('email.submit')}
      </Button>
    </form>
  );
}
