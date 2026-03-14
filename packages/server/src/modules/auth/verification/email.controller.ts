import type { Request, Response } from 'express';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { SendVerificationCodeRequest, VerifyCodeRequest } from '@knowledge-agent/shared';
import { emailVerificationService } from '../verification/email-verification.service';
import { userService } from '../../user';
import { sendSuccessResponse } from '@core/errors';
import { Errors } from '@core/errors';
import { asyncHandler } from '@core/errors/async-handler';
import { getValidatedBody } from '@core/middleware';
import { getClientIp, normalizeEmail } from '@core/utils';

export const emailController = {
  /**
   * POST /api/auth/email/send-code
   */
  sendCode: asyncHandler(async (req: Request, res: Response) => {
    const { email: rawEmail, type } = getValidatedBody<SendVerificationCodeRequest>(res);
    const email = normalizeEmail(rawEmail);
    const ipAddress = getClientIp(req);

    // For registration and email change, check if email is already registered
    if (type === 'register' || type === 'change_email') {
      const emailExists = await userService.existsByEmail(email);
      if (emailExists) {
        throw Errors.auth(
          AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
          'An account with this email already exists',
          400
        );
      }
    }

    // For password reset, check if email exists
    if (type === 'reset_password') {
      const emailExists = await userService.existsByEmail(email);
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
  }),

  /**
   * POST /api/auth/email/verify-code
   */
  verifyCode: asyncHandler(async (_req: Request, res: Response) => {
    const { email: rawEmail, code, type } = getValidatedBody<VerifyCodeRequest>(res);
    const email = normalizeEmail(rawEmail);

    const result = await emailVerificationService.verifyCode(email, code, type);

    sendSuccessResponse(res, {
      verified: true,
      verificationToken: result.verificationToken,
    });
  }),
};
