import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { emailApi } from '@/api';
import { resolveEmailSendErrorMessage, resolveEmailVerifyErrorMessage } from './errorMessage';
import { useExpiryCountdown } from './useExpiryCountdown';

const RESEND_COOLDOWN = 60;

type VerificationScope = 'email' | 'password.setup';
type VerificationType = 'reset_password' | 'change_email';
type SecurityErrorState = string | null;
type SetSecurityError = Dispatch<SetStateAction<SecurityErrorState>>;

const verificationFlows = {
  emailChange: {
    scope: 'email',
    type: 'change_email',
    keys: {
      emailMissing: 'email.emailMissing',
      codeExpired: 'email.codeExpired',
      codeInvalidLength: 'email.codeInvalidLength',
      codeSent: 'email.codeSent',
      verified: 'email.verified',
      verificationExpired: 'email.verificationExpired',
    },
  },
  passwordSetup: {
    scope: 'password.setup',
    type: 'reset_password',
    keys: {
      emailMissing: 'password.setup.emailMissing',
      codeExpired: 'password.setup.codeExpired',
      codeInvalidLength: 'password.setup.codeInvalidLength',
      codeSent: 'password.setup.codeSent',
      verified: 'password.setup.verified',
      verificationExpired: 'password.setup.verificationExpired',
    },
  },
} as const satisfies Record<
  string,
  {
    scope: VerificationScope;
    type: VerificationType;
    keys: {
      emailMissing: string;
      codeExpired: string;
      codeInvalidLength: string;
      codeSent: string;
      verified: string;
      verificationExpired: string;
    };
  }
>;

export type EmailVerificationFlow = keyof typeof verificationFlows;

interface UseEmailVerificationOptions {
  email: string | undefined;
  flow: EmailVerificationFlow;
  t: TFunction<'security'>;
  setError: SetSecurityError;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function useEmailVerification({ email, flow, t, setError }: UseEmailVerificationOptions) {
  const [code, setCode] = useState('');
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationExpiresAt, setVerificationExpiresAt] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const hasAutoVerified = useRef(false);
  const requestVersionRef = useRef(0);

  const { scope, type, keys } = verificationFlows[flow];
  const tr = t as Translate;

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  const preserveError = useCallback(
    (message: string) => {
      setError((current) => current ?? message);
    },
    [setError]
  );

  const replaceError = useCallback(
    (message: string) => {
      setError(message);
    },
    [setError]
  );

  const clearVerifiedState = useCallback(() => {
    setVerificationToken('');
    setVerificationExpiresAt(null);
    hasAutoVerified.current = false;
  }, []);

  const resetVerificationState = useCallback(() => {
    setCode('');
    setCodeExpiresAt(null);
    clearVerifiedState();
    setResendCooldown(0);
    setIsSendingCode(false);
    setIsVerifyingCode(false);
  }, [clearVerifiedState]);

  useEffect(() => {
    requestVersionRef.current += 1;
    resetVerificationState();
  }, [email, flow, resetVerificationState]);

  const codeRemainingSeconds = useExpiryCountdown(
    codeExpiresAt,
    useCallback(() => {
      setCodeExpiresAt(null);
      preserveError(tr(keys.codeExpired));
    }, [keys.codeExpired, preserveError, tr])
  );

  const verificationRemainingSeconds = useExpiryCountdown(
    verificationExpiresAt,
    useCallback(() => {
      clearVerifiedState();
      preserveError(tr(keys.verificationExpired));
    }, [clearVerifiedState, keys.verificationExpired, preserveError, tr])
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
    const requestVersion = requestVersionRef.current;

    if (!email) {
      replaceError(tr(keys.emailMissing));
      return;
    }

    clearError();
    setIsSendingCode(true);

    try {
      const result = await emailApi.sendCode({ email, type });
      if (requestVersion !== requestVersionRef.current) return;

      setCode('');
      setCodeExpiresAt(result.expiresAt);
      clearVerifiedState();
      setResendCooldown(RESEND_COOLDOWN);
      toast.success(tr(keys.codeSent));
    } catch (err) {
      if (requestVersion !== requestVersionRef.current) return;

      replaceError(resolveEmailSendErrorMessage(err as AxiosError<ApiResponse>, t, scope));
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setIsSendingCode(false);
      }
    }
  }, [
    clearError,
    clearVerifiedState,
    email,
    keys.codeSent,
    keys.emailMissing,
    replaceError,
    scope,
    t,
    tr,
    type,
  ]);

  const handleVerifyCode = useCallback(
    async (codeToVerify: string) => {
      const requestVersion = requestVersionRef.current;

      if (hasActiveVerification) return;

      if (!email) {
        replaceError(tr(keys.emailMissing));
        return;
      }

      if (codeToVerify.length !== 6) {
        replaceError(tr(keys.codeInvalidLength));
        return;
      }

      if (codeRemainingSeconds === 0) {
        replaceError(tr(keys.codeExpired));
        return;
      }

      clearError();
      setIsVerifyingCode(true);

      try {
        const result = await emailApi.verifyCode({ email, code: codeToVerify, type });
        if (requestVersion !== requestVersionRef.current) return;

        setVerificationToken(result.verificationToken);
        setVerificationExpiresAt(result.expiresAt);
        setCodeExpiresAt(null);
        toast.success(tr(keys.verified));
      } catch (err) {
        if (requestVersion !== requestVersionRef.current) return;

        clearVerifiedState();
        replaceError(resolveEmailVerifyErrorMessage(err as AxiosError<ApiResponse>, t, scope));
      } finally {
        if (requestVersion === requestVersionRef.current) {
          setIsVerifyingCode(false);
        }
      }
    },
    [
      clearError,
      clearVerifiedState,
      codeRemainingSeconds,
      email,
      hasActiveVerification,
      keys.codeExpired,
      keys.codeInvalidLength,
      keys.emailMissing,
      keys.verified,
      replaceError,
      scope,
      t,
      tr,
      type,
    ]
  );

  const handleCodeChange = useCallback(
    (nextCode: string) => {
      clearError();
      setCode(nextCode);
      clearVerifiedState();

      if (nextCode.length === 6 && !hasAutoVerified.current && !isVerifyingCode) {
        hasAutoVerified.current = true;
        void handleVerifyCode(nextCode);
      } else if (nextCode.length < 6) {
        hasAutoVerified.current = false;
      }
    },
    [clearError, clearVerifiedState, handleVerifyCode, isVerifyingCode]
  );

  const showVerificationSection =
    resendCooldown > 0 ||
    code.length > 0 ||
    codeExpiresAt !== null ||
    verificationToken.length > 0 ||
    verificationExpiresAt !== null;

  return {
    code,
    verificationToken,
    isSendingCode,
    isVerifyingCode,
    resendCooldown,
    codeRemainingSeconds,
    verificationRemainingSeconds,
    hasActiveVerification,
    showVerificationSection,
    handleSendCode,
    handleCodeChange,
    handleVerifyCode,
    reset: resetVerificationState,
  };
}
