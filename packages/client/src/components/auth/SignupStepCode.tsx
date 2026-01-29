import { useState, useEffect, useCallback } from 'react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { Button } from '@/components/ui/button';
import { VerificationCodeInput } from './VerificationCodeInput';
import { emailApi } from '@/api/email';

interface SignupStepCodeProps {
  email: string;
  onNext: (verificationToken: string) => void;
  onBack: () => void;
}

const RESEND_COOLDOWN = 60; // seconds

export function SignupStepCode({ email, onNext, onBack }: SignupStepCodeProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setError(null);
    setIsVerifying(true);

    try {
      const result = await emailApi.verifyCode({ email, code, type: 'register' });
      onNext(result.verificationToken);
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse>;
      setError(axiosError.response?.data?.error?.message || 'Invalid verification code');
    } finally {
      setIsVerifying(false);
    }
  }, [code, email, onNext]);

  // Auto-verify when 6 digits are entered
  useEffect(() => {
    if (code.length === 6) {
      handleVerify();
    }
  }, [code.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResend = async () => {
    setError(null);
    setIsResending(true);

    try {
      await emailApi.sendCode({ email, type: 'register' });
      setResendCooldown(RESEND_COOLDOWN);
      setCode('');
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse>;
      setError(axiosError.response?.data?.error?.message || 'Failed to resend code');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">We've sent a verification code to</p>
        <p className="font-medium">{email}</p>
      </div>

      <div className="space-y-4">
        <VerificationCodeInput
          value={code}
          onChange={setCode}
          disabled={isVerifying}
          autoFocus
          error={!!error}
        />

        {error && <div className="text-sm text-destructive text-center">{error}</div>}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleResend}
          disabled={resendCooldown > 0 || isResending}
        >
          {isResending
            ? 'Sending...'
            : resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : 'Resend code'}
        </Button>
      </div>
    </div>
  );
}
