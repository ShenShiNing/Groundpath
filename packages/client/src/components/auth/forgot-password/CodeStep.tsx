import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@groundpath/shared/types';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { emailApi } from '@/api';
import { VerificationCodeInput } from '@/components/auth/VerificationCodeInput';
import { translateApiError } from '@/lib/http/translate-error';
import { RESEND_COOLDOWN } from './types';

interface CodeStepProps {
  email: string;
  onNext: (token: string) => void;
  onBack: () => void;
}

export function CodeStep({ email, onNext, onBack }: CodeStepProps) {
  const { t } = useTranslation(['auth', 'common']);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const hasAutoVerified = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendCooldown((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerify = useCallback(
    async (codeToVerify: string) => {
      if (codeToVerify.length !== 6) {
        setError(t('forgot.code.invalidLength'));
        return;
      }

      setError(null);
      setIsVerifying(true);

      try {
        const result = await emailApi.verifyCode({
          email,
          code: codeToVerify,
          type: 'reset_password',
        });
        onNext(result.verificationToken);
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(translateApiError(axiosError));
        hasAutoVerified.current = false;
      } finally {
        setIsVerifying(false);
      }
    },
    [email, onNext, t]
  );

  const handleCodeChange = useCallback(
    (nextCode: string) => {
      setCode(nextCode);

      if (nextCode.length === 6 && !hasAutoVerified.current && !isVerifying) {
        hasAutoVerified.current = true;
        void handleVerify(nextCode);
      } else if (nextCode.length < 6) {
        hasAutoVerified.current = false;
      }
    },
    [handleVerify, isVerifying]
  );

  async function handleResend() {
    setError(null);
    setIsResending(true);

    try {
      await emailApi.sendCode({ email, type: 'reset_password' });
      setResendCooldown(RESEND_COOLDOWN);
      setCode('');
      hasAutoVerified.current = false;
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse>;
      setError(translateApiError(axiosError));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-sm text-muted-foreground">{t('forgot.code.sentTo')}</p>
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
        {error && <div className="text-center text-sm text-destructive">{error}</div>}
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          className="w-full cursor-pointer"
          onClick={() => void handleVerify(code)}
          disabled={code.length !== 6 || isVerifying}
        >
          {isVerifying ? t('forgot.code.verifying') : t('forgot.code.verify')}
        </Button>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={onBack}
          >
            {t('common:back')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={() => void handleResend()}
            disabled={resendCooldown > 0 || isResending}
          >
            {isResending
              ? t('forgot.email.sending')
              : resendCooldown > 0
                ? t('forgot.code.resendAfter', { seconds: resendCooldown })
                : t('forgot.code.resend')}
          </Button>
        </div>
      </div>
    </div>
  );
}
