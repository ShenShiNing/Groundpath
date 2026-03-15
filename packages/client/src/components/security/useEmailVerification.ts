import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { emailApi } from '@/api';
import { resolveEmailSendErrorMessage, resolveEmailVerifyErrorMessage } from './errorMessage';
import { useExpiryCountdown } from './useExpiryCountdown';

const RESEND_COOLDOWN = 60;

export interface EmailVerificationState {
  code: string;
  codeRemainingSeconds: number;
  verificationToken: string;
  verificationRemainingSeconds: number;
  hasActiveVerification: boolean;
  isSendingCode: boolean;
  isVerifyingCode: boolean;
  resendCooldown: number;
  showVerificationSection: boolean;
  handleSendCode: () => Promise<void>;
  handleVerifyCode: (codeToVerify: string) => Promise<void>;
  handleCodeChange: (nextCode: string) => void;
  resetVerification: () => void;
}

export function useEmailVerification(
  email: string | undefined,
  t: TFunction<'security'>,
  setError: (error: string | null) => void
): EmailVerificationState {
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
      setError(t('password.setup.codeExpired'));
    }, [t, setError])
  );

  const verificationRemainingSeconds = useExpiryCountdown(
    verificationExpiresAt,
    useCallback(() => {
      setVerificationToken('');
      setVerificationExpiresAt(null);
      hasAutoVerified.current = false;
      setError(t('password.setup.verificationExpired'));
    }, [t, setError])
  );

  const hasActiveVerification = verificationToken.length > 0 && verificationRemainingSeconds > 0;

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSendCode = useCallback(async () => {
    if (!email) {
      setError(t('password.setup.emailMissing'));
      return;
    }

    setError(null);
    setIsSendingCode(true);

    try {
      const result = await emailApi.sendCode({
        email,
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
  }, [email, t, setError]);

  const handleVerifyCode = useCallback(
    async (codeToVerify: string) => {
      if (hasActiveVerification) return;

      if (!email) {
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
          email,
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
    [codeRemainingSeconds, hasActiveVerification, email, t, setError]
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
    [handleVerifyCode, isVerifyingCode, setError]
  );

  const resetVerification = useCallback(() => {
    setCode('');
    setCodeExpiresAt(null);
    setVerificationToken('');
    setVerificationExpiresAt(null);
    setResendCooldown(0);
    hasAutoVerified.current = false;
  }, []);

  const showVerificationSection =
    resendCooldown > 0 ||
    code.length > 0 ||
    codeExpiresAt !== null ||
    verificationToken.length > 0 ||
    verificationExpiresAt !== null;

  return {
    code,
    codeRemainingSeconds,
    verificationToken,
    verificationRemainingSeconds,
    hasActiveVerification,
    isSendingCode,
    isVerifyingCode,
    resendCooldown,
    showVerificationSection,
    handleSendCode,
    handleVerifyCode,
    handleCodeChange,
    resetVerification,
  };
}
