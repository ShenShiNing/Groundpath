import { EMAIL_ERROR_CODES } from '../constants';

// Re-export types from schemas (inferred from Zod schemas)
export type {
  EmailVerificationCodeType,
  SendVerificationCodeRequest,
  VerifyCodeRequest,
  RegisterWithCodeRequest,
  ResetPasswordRequest,
} from '../schemas/email';

// ==================== Error Types ====================

export type EmailErrorCode = (typeof EMAIL_ERROR_CODES)[keyof typeof EMAIL_ERROR_CODES];

// ==================== Response Types ====================

/** Response after sending verification code */
export interface SendVerificationCodeResponse {
  message: string;
  expiresAt: string;
}

/** Response after verifying code */
export interface VerifyCodeResponse {
  verified: boolean;
  verificationToken: string;
  expiresAt: string;
}

/** Response after password reset */
export interface ResetPasswordResponse {
  message: string;
  sessionsRevoked?: number;
}
