import bcrypt from 'bcryptjs';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { ResetPasswordRequest } from '@knowledge-agent/shared/types';
import { Errors } from '@core/errors';
import { withTransaction, type Transaction } from '@core/db/db.utils';
import { normalizeEmail } from '@core/utils';
import { authConfig } from '@config/env';
import { userService } from '../../user';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';
import { userTokenStateRepository } from '../repositories/user-token-state.repository';
import { emailVerificationService } from '../verification/email-verification.service';
import { logOperation } from '@core/logger/operation-logger';

/** Hash a plaintext password using the configured salt rounds. */
function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, authConfig.bcrypt.saltRounds);
}

/** Revoke all refresh tokens and bump tokenValidAfter within a transaction. */
async function revokeAllUserSessions(userId: string, tx: Transaction): Promise<number> {
  const revoked = await refreshTokenRepository.revokeAllForUser(userId, tx);
  await userTokenStateRepository.bumpTokenValidAfter(userId, tx);
  return revoked;
}

async function updatePasswordAndMaybeRevokeSessions(input: {
  userId: string;
  hashedPassword: string;
  revokeSessions: boolean;
}): Promise<number | undefined> {
  return withTransaction(async (tx) => {
    await userService.updatePassword(input.userId, input.hashedPassword, tx);

    if (!input.revokeSessions) {
      return undefined;
    }

    return revokeAllUserSessions(input.userId, tx);
  });
}

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

    if (oldPassword === newPassword) {
      throw Errors.validation('New password must be different from current password');
    }

    // Hash new password (outside transaction - no DB writes)
    const hashedPassword = await hashPassword(newPassword);

    // Transaction: update password and revoke all tokens atomically
    await updatePasswordAndMaybeRevokeSessions({
      userId,
      hashedPassword,
      revokeSessions: true,
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
    const { newPassword, verificationToken, logoutAllDevices } = data;
    const email = normalizeEmail(data.email);

    // Verify the verification token (outside transaction - no DB writes)
    const { email: verifiedEmail } = emailVerificationService.verifyToken(
      verificationToken,
      'reset_password'
    );

    // Ensure the email matches (verifiedEmail is already normalized in token)
    if (verifiedEmail !== email) {
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
    const hashedPassword = await hashPassword(newPassword);

    // Transaction: update password and optionally revoke sessions atomically
    const sessionsRevoked = await updatePasswordAndMaybeRevokeSessions({
      userId: user.id,
      hashedPassword,
      revokeSessions: logoutAllDevices !== false,
    });

    return {
      message: 'Password reset successfully',
      sessionsRevoked,
    };
  },
};
