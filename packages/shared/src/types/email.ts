// Re-export types from schemas (inferred from Zod schemas)
export type {
  EmailVerificationCodeType,
  SendVerificationCodeRequest,
  VerifyCodeRequest,
  RegisterWithCodeRequest,
  ResetPasswordRequest,
} from '../schemas/email';

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
}

/** Response after password reset */
export interface ResetPasswordResponse {
  message: string;
  sessionsRevoked?: number;
}
