import { useState, useEffect, useCallback, useRef } from 'react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { VerificationCodeInput } from './VerificationCodeInput';
import { emailApi } from '@/api';

interface SignupStepCodeProps {
  email: string;
  onNext: (verificationToken: string) => void;
  onBack: () => void;
}

const RESEND_COOLDOWN = 60; // seconds

export function SignupStepCode({ email, onNext, onBack }: SignupStepCodeProps) {
  const { t } = useTranslation(['auth', 'common']);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const hasAutoVerified = useRef(false);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerify = useCallback(
    async (codeToVerify: string) => {
      if (codeToVerify.length !== 6) {
        setError(t('signup.code.invalidLength'));
        return;
      }

      setError(null);
      setIsVerifying(true);

      try {
        const result = await emailApi.verifyCode({ email, code: codeToVerify, type: 'register' });
        onNext(result.verificationToken);
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(axiosError.response?.data?.error?.message || t('signup.code.invalid'));
        // Reset auto-verify flag on error so user can try again
        hasAutoVerified.current = false;
      } finally {
        setIsVerifying(false);
      }
    },
    [email, onNext, t]
  );

  // Handle code change with auto-verify
  const handleCodeChange = useCallback(
    (newCode: string) => {
      setCode(newCode);
      // Auto-verify when 6 digits are entered (only once per complete input)
      if (newCode.length === 6 && !hasAutoVerified.current && !isVerifying) {
        hasAutoVerified.current = true;
        handleVerify(newCode);
      } else if (newCode.length < 6) {
        // Reset flag when code is incomplete
        hasAutoVerified.current = false;
      }
    },
    [handleVerify, isVerifying]
  );

  const handleResend = async () => {
    setError(null);
    setIsResending(true);

    try {
      await emailApi.sendCode({ email, type: 'register' });
      setResendCooldown(RESEND_COOLDOWN);
      setCode('');
      hasAutoVerified.current = false;
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse>;
      setError(axiosError.response?.data?.error?.message || t('signup.code.resendFailed'));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">{t('signup.code.sentTo')}</p>
        <p className="font-medium">{email}</p>
      </div>

      <div className="space-y-4">
        <VerificationCodeInput
          value={code}
          onChange={handleCodeChange}
          disabled={isVerifying}
          autoFocus
          error={!!error}
        />

        {error && <div className="text-sm text-destructive text-center">{error}</div>}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={onBack}>
          {t('common:back')}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={handleResend}
          disabled={resendCooldown > 0 || isResending}
        >
          {isResending
            ? t('signup.code.sending')
            : resendCooldown > 0
              ? t('signup.code.resendAfter', { seconds: resendCooldown })
              : t('signup.code.resend')}
        </Button>
      </div>
    </div>
  );
}
