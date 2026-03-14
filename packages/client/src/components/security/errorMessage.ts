import { AUTH_ERROR_CODES, EMAIL_ERROR_CODES } from '@knowledge-agent/shared';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import type { AxiosError } from 'axios';

function getRetryAfterSeconds(error: AxiosError<ApiResponse>): number | undefined {
  const retryAfter = error.response?.data?.error?.details?.retryAfter;
  return typeof retryAfter === 'number' ? retryAfter : undefined;
}

export function resolveEmailSendErrorMessage(
  error: AxiosError<ApiResponse>,
  t: (key: string, options?: Record<string, unknown>) => string,
  scope: 'email' | 'password.setup'
): string {
  const code = error.response?.data?.error?.code;
  const retryAfter = getRetryAfterSeconds(error);

  switch (code) {
    case AUTH_ERROR_CODES.RATE_LIMITED:
      return t(`${scope}.rateLimitedSend`, { seconds: retryAfter ?? 60 });
    case EMAIL_ERROR_CODES.MAX_CODES_EXCEEDED:
      return t(`${scope}.maxCodesExceeded`);
    case EMAIL_ERROR_CODES.RESEND_COOLDOWN:
      return t(`${scope}.resendAfter`, { seconds: retryAfter ?? 60 });
    case EMAIL_ERROR_CODES.EMAIL_SEND_FAILED:
      return t(`${scope}.sendFailed`);
    case AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS:
      return t(`${scope}.alreadyExists`);
    default:
      return error.response?.data?.error?.message || t(`${scope}.sendFailed`);
  }
}

export function resolveEmailVerifyErrorMessage(
  error: AxiosError<ApiResponse>,
  t: (key: string, options?: Record<string, unknown>) => string,
  scope: 'email' | 'password.setup'
): string {
  const code = error.response?.data?.error?.code;
  const retryAfter = getRetryAfterSeconds(error);

  switch (code) {
    case AUTH_ERROR_CODES.RATE_LIMITED:
      return t(`${scope}.rateLimitedVerify`, { seconds: retryAfter ?? 60 });
    case EMAIL_ERROR_CODES.CODE_INVALID:
      return t(`${scope}.invalidCode`);
    default:
      return error.response?.data?.error?.message || t(`${scope}.verifyFailed`);
  }
}

export function resolveEmailSubmitErrorMessage(
  error: AxiosError<ApiResponse>,
  t: (key: string, options?: Record<string, unknown>) => string,
  scope: 'email' | 'password.setup'
): string {
  const code = error.response?.data?.error?.code;

  switch (code) {
    case AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS:
      return t(`${scope}.alreadyExists`);
    case EMAIL_ERROR_CODES.VERIFICATION_TOKEN_EXPIRED:
    case EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID:
    case AUTH_ERROR_CODES.TOKEN_INVALID:
      return t(`${scope}.verificationExpired`);
    default:
      return (
        error.response?.data?.error?.message ||
        t(scope === 'email' ? 'email.updateFailed' : 'password.setup.failed')
      );
  }
}
