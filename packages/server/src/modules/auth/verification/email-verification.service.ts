import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES, EMAIL_ERROR_CODES } from '@knowledge-agent/shared';
import type { EmailVerificationCodeType } from '@knowledge-agent/shared/types';
import { emailConfig } from '@config/env';
import { emailVerificationRepository } from '../verification/email-verification.repository';
import { emailService } from './email.service';
import { AppError, Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import {
  generateEmailVerificationToken,
  normalizeEmail,
  verifyEmailVerificationToken,
} from '@core/utils';

const logger = createLogger('email-verification');

interface VerificationTokenPayload {
  sub: string; // email
  type: EmailVerificationCodeType;
  purpose: 'email_verified';
}

/**
 * Generate a cryptographically secure 6-digit code
 */
function generateSecureCode(): string {
  // Generate a random number between 0 and 999999
  const code = randomInt(0, 1000000);
  // Pad with leading zeros to ensure 6 digits
  return code.toString().padStart(6, '0');
}

/**
 * Generate a verification token (JWT) that proves email was verified
 */
function generateVerificationToken(email: string, type: EmailVerificationCodeType): string {
  const payload: VerificationTokenPayload = {
    sub: normalizeEmail(email),
    type,
    purpose: 'email_verified',
  };

  return generateEmailVerificationToken(
    payload,
    `${emailConfig.verification.tokenExpiresInMinutes}m`
  );
}

/**
 * Verify a verification token and return the payload
 */
function verifyVerificationToken(
  token: string,
  expectedType: EmailVerificationCodeType
): VerificationTokenPayload {
  try {
    const decoded = verifyEmailVerificationToken(token);

    if (decoded.purpose !== 'email_verified') {
      throw Errors.auth(
        EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID,
        'Invalid verification token',
        400
      );
    }

    if (decoded.type !== expectedType) {
      throw Errors.auth(
        EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID,
        'Invalid verification token type',
        400
      );
    }

    return {
      sub: decoded.sub!,
      type: expectedType,
      purpose: decoded.purpose,
    };
  } catch (error) {
    if (error instanceof AppError && error.code === AUTH_ERROR_CODES.TOKEN_EXPIRED) {
      throw Errors.auth(
        EMAIL_ERROR_CODES.VERIFICATION_TOKEN_EXPIRED,
        'Verification token has expired. Please verify your email again.',
        400
      );
    }
    if (error instanceof AppError && error.code === AUTH_ERROR_CODES.TOKEN_INVALID) {
      throw Errors.auth(
        EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID,
        'Invalid verification token',
        400
      );
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw error;
  }
}

/**
 * Email verification service for sending and verifying codes
 */
export const emailVerificationService = {
  /**
   * Send a verification code to an email
   */
  async sendCode(
    email: string,
    type: EmailVerificationCodeType,
    ipAddress: string | null
  ): Promise<{ expiresAt: Date }> {
    const normalizedEmail = normalizeEmail(email);

    // Check rate limits - max codes per hour
    const recentCount = await emailVerificationRepository.countRecentCodes(normalizedEmail, type);
    if (recentCount >= emailConfig.verification.maxCodesPerHour) {
      throw Errors.auth(
        EMAIL_ERROR_CODES.MAX_CODES_EXCEEDED,
        'Too many verification codes requested. Please try again later.',
        429
      );
    }

    // Check resend cooldown
    const mostRecent = await emailVerificationRepository.getMostRecentCodeWithAge(
      normalizedEmail,
      type
    );
    if (mostRecent) {
      const { secondsSinceCreation } = mostRecent;
      const cooldownSeconds = emailConfig.verification.resendCooldownSeconds;

      if (secondsSinceCreation < cooldownSeconds) {
        const remainingSeconds = cooldownSeconds - secondsSinceCreation;
        throw Errors.auth(
          EMAIL_ERROR_CODES.RESEND_COOLDOWN,
          `Please wait ${remainingSeconds} seconds before requesting another code`,
          429,
          { retryAfter: remainingSeconds }
        );
      }
    }

    // Invalidate any existing unused codes
    await emailVerificationRepository.invalidateAllForEmail(normalizedEmail, type);

    // Generate new code
    const code = generateSecureCode();
    const codeId = uuidv4();

    // Store the code
    await emailVerificationRepository.create(codeId, normalizedEmail, code, type, ipAddress);

    // Send the email
    try {
      await emailService.sendVerificationCode({
        to: normalizedEmail,
        code,
        type,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to send verification email');
      throw Errors.auth(
        EMAIL_ERROR_CODES.EMAIL_SEND_FAILED,
        'Failed to send verification email. Please try again later.',
        500
      );
    }

    // Calculate expiration time
    const expiresAt = new Date(
      Date.now() + emailConfig.verification.codeExpiresInMinutes * 60 * 1000
    );

    return { expiresAt };
  },

  /**
   * Verify a code and return a verification token
   */
  async verifyCode(
    email: string,
    code: string,
    type: EmailVerificationCodeType
  ): Promise<{ verificationToken: string; expiresAt: Date }> {
    const normalizedEmail = normalizeEmail(email);

    // Find the code
    const verificationCode = await emailVerificationRepository.findValidCode(
      normalizedEmail,
      code,
      type
    );

    if (!verificationCode) {
      throw Errors.auth(
        EMAIL_ERROR_CODES.CODE_INVALID,
        'Invalid or expired verification code',
        400
      );
    }

    // Mark as used
    await emailVerificationRepository.markAsUsed(verificationCode.id);

    // Generate verification token
    const verificationToken = generateVerificationToken(normalizedEmail, type);
    const expiresAt = new Date(
      Date.now() + emailConfig.verification.tokenExpiresInMinutes * 60 * 1000
    );

    return { verificationToken, expiresAt };
  },

  /**
   * Verify a verification token and return the email
   * This is used by authService when completing registration or password reset
   */
  verifyToken(token: string, expectedType: EmailVerificationCodeType): { email: string } {
    const payload = verifyVerificationToken(token, expectedType);
    return { email: payload.sub };
  },
};
