import { AUTH_ERROR_CODES, EMAIL_ERROR_CODES } from '@knowledge-agent/shared';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import type { AxiosError } from 'axios';
import type { TFunction } from 'i18next';
import { translateApiError } from '@/lib/http/translate-error';

const securityTranslationKeys = {
  email: {
    alreadyExists: 'email.alreadyExists',
    invalidCode: 'email.invalidCode',
    maxCodesExceeded: 'email.maxCodesExceeded',
    rateLimitedSend: 'email.rateLimitedSend',
    rateLimitedVerify: 'email.rateLimitedVerify',
    resendAfter: 'email.resendAfter',
    sendFailed: 'email.sendFailed',
    verificationExpired: 'email.verificationExpired',
  },
  'password.setup': {
    invalidCode: 'password.setup.invalidCode',
    maxCodesExceeded: 'password.setup.maxCodesExceeded',
    rateLimitedSend: 'password.setup.rateLimitedSend',
    rateLimitedVerify: 'password.setup.rateLimitedVerify',
    resendAfter: 'password.setup.resendAfter',
    sendFailed: 'password.setup.sendFailed',
    verificationExpired: 'password.setup.verificationExpired',
  },
} as const;

type SecurityTranslationScope = keyof typeof securityTranslationKeys;

function getRetryAfterSeconds(error: AxiosError<ApiResponse>): number | undefined {
  const retryAfter = error.response?.data?.error?.details?.retryAfter;
  return typeof retryAfter === 'number' ? retryAfter : undefined;
}

export function resolveEmailSendErrorMessage(
  error: AxiosError<ApiResponse>,
  t: TFunction<'security'>,
  scope: SecurityTranslationScope
): string {
  const code = error.response?.data?.error?.code;
  const retryAfter = getRetryAfterSeconds(error);

  switch (code) {
    case AUTH_ERROR_CODES.RATE_LIMITED:
      return t(securityTranslationKeys[scope].rateLimitedSend, { seconds: retryAfter ?? 60 });
    case EMAIL_ERROR_CODES.MAX_CODES_EXCEEDED:
      return t(securityTranslationKeys[scope].maxCodesExceeded);
    case EMAIL_ERROR_CODES.RESEND_COOLDOWN:
      return t(securityTranslationKeys[scope].resendAfter, { seconds: retryAfter ?? 60 });
    case EMAIL_ERROR_CODES.EMAIL_SEND_FAILED:
      return t(securityTranslationKeys[scope].sendFailed);
    case AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS:
      return scope === 'email'
        ? t(securityTranslationKeys.email.alreadyExists)
        : translateApiError(error);
    default:
      return translateApiError(error);
  }
}

export function resolveEmailVerifyErrorMessage(
  error: AxiosError<ApiResponse>,
  t: TFunction<'security'>,
  scope: SecurityTranslationScope
): string {
  const code = error.response?.data?.error?.code;
  const retryAfter = getRetryAfterSeconds(error);

  switch (code) {
    case AUTH_ERROR_CODES.RATE_LIMITED:
      return t(securityTranslationKeys[scope].rateLimitedVerify, {
        seconds: retryAfter ?? 60,
      });
    case EMAIL_ERROR_CODES.CODE_INVALID:
      return t(securityTranslationKeys[scope].invalidCode);
    default:
      return translateApiError(error);
  }
}

export function resolveEmailSubmitErrorMessage(
  error: AxiosError<ApiResponse>,
  t: TFunction<'security'>,
  scope: SecurityTranslationScope
): string {
  const code = error.response?.data?.error?.code;

  switch (code) {
    case AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS:
      return scope === 'email'
        ? t(securityTranslationKeys.email.alreadyExists)
        : translateApiError(error);
    case EMAIL_ERROR_CODES.VERIFICATION_TOKEN_EXPIRED:
    case EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID:
    case AUTH_ERROR_CODES.TOKEN_INVALID:
      return t(securityTranslationKeys[scope].verificationExpired);
    default:
      return translateApiError(error);
  }
}
