import type { Request, Response } from 'express';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { SendVerificationCodeRequest, VerifyCodeRequest } from '@knowledge-agent/shared';
import { emailVerificationService } from '../services/emailVerificationService';
import { userRepository } from '../repositories/userRepository';
import { handleError, sendSuccessResponse } from '../utils/errors';
import { getClientIp } from '../utils/requestUtils';
import { AuthError } from '../utils/errors';

/**
 * Email verification controller handlers
 */
export const emailController = {
  /**
   * POST /api/auth/email/send-code
   * Send a verification code to an email address
   */
  async sendCode(req: Request, res: Response): Promise<void> {
    try {
      const { email, type } = req.body as SendVerificationCodeRequest;
      const ipAddress = getClientIp(req);

      // For registration, check if email is already registered
      if (type === 'register') {
        const emailExists = await userRepository.existsByEmail(email);
        if (emailExists) {
          throw new AuthError(
            AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
            'An account with this email already exists',
            400
          );
        }
      }

      // For password reset, check if email exists
      if (type === 'reset_password') {
        const emailExists = await userRepository.existsByEmail(email);
        if (!emailExists) {
          // For security, don't reveal whether email exists
          // Still return success to prevent email enumeration
          sendSuccessResponse(res, {
            message: 'If an account exists with this email, a verification code has been sent.',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });
          return;
        }
      }

      const result = await emailVerificationService.sendCode(email, type, ipAddress);

      sendSuccessResponse(res, {
        message: 'Verification code sent successfully',
        expiresAt: result.expiresAt.toISOString(),
      });
    } catch (error) {
      handleError(error, res, 'Email controller');
    }
  },

  /**
   * POST /api/auth/email/verify-code
   * Verify a code and return a verification token
   */
  async verifyCode(req: Request, res: Response): Promise<void> {
    try {
      const { email, code, type } = req.body as VerifyCodeRequest;

      const result = await emailVerificationService.verifyCode(email, code, type);

      sendSuccessResponse(res, {
        verified: true,
        verificationToken: result.verificationToken,
      });
    } catch (error) {
      handleError(error, res, 'Email controller');
    }
  },
};
