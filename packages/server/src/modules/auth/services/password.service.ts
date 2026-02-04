import bcrypt from 'bcryptjs';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { ResetPasswordRequest } from '@knowledge-agent/shared/types';
import { Errors } from '@shared/errors';
import { withTransaction } from '@shared/db/db.utils';
import { userService } from '../../user';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';
import { emailVerificationService } from '../verification/email-verification.service';
import { logOperation } from '@shared/logger/operation-logger';

/**
 * Password service for managing user passwords
 */
export const passwordService = {
  /**
   * Change user password
   * Wrapped in a transaction to ensure password update and token revocation are atomic
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const startTime = Date.now();

    // Find user (outside transaction - read-only)
    const user = await userService.findById(userId);
    if (!user || !user.password) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }

    // Verify old password (outside transaction - no DB writes)
    const isValidPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidPassword) {
      throw Errors.auth(AUTH_ERROR_CODES.INVALID_PASSWORD, 'Current password is incorrect', 400);
    }

    // Hash new password (outside transaction - no DB writes)
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Transaction: update password and revoke all tokens atomically
    await withTransaction(async (tx) => {
      // Update password
      await userService.updatePassword(userId, hashedPassword, tx);

      // Revoke all refresh tokens for security (force re-login on all devices)
      await refreshTokenRepository.revokeAllForUser(userId, tx);
    });

    // Log the operation (outside transaction - non-critical)
    logOperation({
      userId,
      resourceType: 'user',
      resourceId: userId,
      action: 'user.change_password',
      description: 'User changed their password',
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
  },

  /**
   * Reset user password with verified email
   * Wrapped in a transaction to ensure password update and token revocation are atomic
   */
  async resetPassword(
    data: ResetPasswordRequest
  ): Promise<{ message: string; sessionsRevoked?: number }> {
    const { email, newPassword, verificationToken, logoutAllDevices } = data;

    // Verify the verification token (outside transaction - no DB writes)
    const { email: verifiedEmail } = emailVerificationService.verifyToken(
      verificationToken,
      'reset_password'
    );

    // Ensure the email matches
    if (verifiedEmail !== email.toLowerCase().trim()) {
      throw Errors.auth(
        AUTH_ERROR_CODES.TOKEN_INVALID,
        'Verification token does not match the provided email',
        400
      );
    }

    // Find user (outside transaction - read-only)
    const user = await userService.findByEmail(email);
    if (!user) {
      throw Errors.auth(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    // Hash new password (outside transaction - no DB writes)
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Transaction: update password and optionally revoke sessions atomically
    const sessionsRevoked = await withTransaction(async (tx) => {
      // Update password
      await userService.updatePassword(user.id, hashedPassword, tx);

      // Optionally revoke all sessions
      if (logoutAllDevices !== false) {
        return refreshTokenRepository.revokeAllForUser(user.id, tx);
      }
      return undefined;
    });

    return {
      message: 'Password reset successfully',
      sessionsRevoked,
    };
  },
};
