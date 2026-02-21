import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { Errors } from '@shared/errors';
import { tokenService } from './token.service';
import { logOperation } from '@shared/logger/operation-logger';
import { userTokenStateRepository } from '../repositories/user-token-state.repository';

/**
 * Session service for managing user sessions
 */
export const sessionService = {
  /**
   * Logout current device (revoke current refresh token)
   */
  async logout(
    tokenId: string,
    userId?: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const startTime = Date.now();
    await tokenService.revokeToken(tokenId);

    // Log the operation if userId is provided
    if (userId) {
      logOperation({
        userId,
        resourceType: 'session',
        resourceId: tokenId,
        action: 'session.logout',
        description: 'User logged out from current session',
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        durationMs: Date.now() - startTime,
      });
    }
  },

  /**
   * Logout all devices (revoke all refresh tokens)
   */
  async logoutAll(
    userId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<number> {
    const startTime = Date.now();
    const count = await tokenService.revokeAllUserTokens(userId);
    await userTokenStateRepository.bumpTokenValidAfter(userId);

    // Log the operation
    logOperation({
      userId,
      resourceType: 'session',
      action: 'session.logout_all',
      description: `User logged out from all devices (${count} sessions revoked)`,
      metadata: { sessionsRevoked: count },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return count;
  },

  /**
   * Get active sessions for current user
   */
  async getSessions(userId: string, currentTokenId?: string) {
    return tokenService.getUserSessions(userId, currentTokenId);
  },

  /**
   * Revoke a specific session
   */
  async revokeSession(
    userId: string,
    sessionId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const startTime = Date.now();

    // Verify the session belongs to the user by checking via token service
    const sessions = await tokenService.getUserSessions(userId);
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      throw Errors.auth(AUTH_ERROR_CODES.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    await tokenService.revokeToken(sessionId);

    // Log the operation
    logOperation({
      userId,
      resourceType: 'session',
      resourceId: sessionId,
      action: 'session.revoke',
      description: 'User revoked a session',
      metadata: {
        deviceType: session.deviceInfo?.deviceType ?? null,
        browser: session.deviceInfo?.browser ?? null,
      },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
  },
};
