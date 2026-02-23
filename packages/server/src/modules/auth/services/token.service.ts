import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { TokenPair, DeviceInfo } from '@knowledge-agent/shared/types';
import { authConfig } from '@config/env';
import type { AccessTokenSubject } from '@shared/types';
import { Errors } from '@shared/errors';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '@shared/utils';
import { withTransaction, type Transaction } from '@shared/db/db.utils';
import { systemLogger } from '@shared/logger/system-logger';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';
import { userTokenStateRepository } from '../repositories/user-token-state.repository';
import { userService } from '../../user';

/**
 * Token service for managing JWT token lifecycle
 */
export const tokenService = {
  /**
   * Generate a new token pair (access + refresh)
   */
  async generateTokenPair(
    user: AccessTokenSubject,
    ipAddress: string | null,
    deviceInfo: DeviceInfo | null,
    tx?: Transaction
  ): Promise<TokenPair> {
    // Generate a session id and bind both access/refresh tokens to it.
    const sessionId = uuidv4();
    const accessToken = generateAccessToken({
      ...user,
      sid: sessionId,
    });
    const refreshTokenString = generateRefreshToken(user.sub, sessionId);

    // Store refresh token in database (时间由 MySQL 服务端计算)
    await refreshTokenRepository.create(
      sessionId,
      user.sub,
      refreshTokenString,
      ipAddress,
      deviceInfo,
      tx
    );

    return {
      accessToken,
      refreshToken: refreshTokenString,
      expiresIn: authConfig.accessToken.expiresInSeconds,
      refreshExpiresIn: authConfig.refreshToken.expiresInSeconds,
    };
  },

  /**
   * Refresh tokens using a valid refresh token
   * Implements token rotation - old token is revoked, new one is issued
   * Wrapped in a transaction to ensure atomicity of the rotation process
   */
  async refreshTokens(
    refreshToken: string,
    ipAddress: string | null,
    deviceInfo: DeviceInfo | null
  ): Promise<TokenPair> {
    // Verify the JWT signature and structure (outside transaction - no DB involved)
    const payload = verifyRefreshToken(refreshToken);

    return withTransaction(async (tx) => {
      // Atomically consume the refresh token once.
      const consumeResult = await refreshTokenRepository.consumeIfValid(
        payload.sid,
        refreshToken,
        tx
      );
      if (consumeResult === 'token_mismatch') {
        await refreshTokenRepository.revokeAllForUser(payload.sub, tx);
        await userTokenStateRepository.bumpTokenValidAfter(payload.sub, tx);
        systemLogger.securityEvent(
          'auth.refresh.token_mismatch',
          'Refresh token mismatch detected, revoked all user sessions',
          {
            userId: payload.sub,
            tokenId: payload.sid,
            ipAddress,
            deviceInfo,
          }
        );
        throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Token validation failed');
      }
      if (consumeResult === 'already_revoked') {
        systemLogger.securityEvent(
          'auth.refresh.replay_blocked',
          'Replay attempt blocked by atomic refresh token consumption',
          {
            userId: payload.sub,
            tokenId: payload.sid,
            ipAddress,
            deviceInfo,
          }
        );
        throw Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Refresh token has already been used');
      }
      if (consumeResult === 'expired') {
        throw Errors.auth(AUTH_ERROR_CODES.TOKEN_EXPIRED, 'Refresh token has expired');
      }
      if (consumeResult === 'not_found') {
        throw Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Refresh token has been revoked');
      }

      // Get user to check status
      const user = await userService.findById(payload.sub);
      if (!user) {
        throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
      }

      // Check user status
      if (user.status === 'banned') {
        await refreshTokenRepository.revokeAllForUser(user.id, tx);
        await userTokenStateRepository.bumpTokenValidAfter(user.id, tx);
        throw Errors.auth(AUTH_ERROR_CODES.USER_BANNED, 'User account is banned', 403);
      }

      // Generate new token pair
      const accessPayload: AccessTokenSubject = {
        sub: user.id,
        email: user.email,
        username: user.username,
        status: user.status,
        emailVerified: user.emailVerified,
      };

      return this.generateTokenPair(accessPayload, ipAddress, deviceInfo, tx);
    });
  },

  /**
   * Revoke a specific refresh token (logout single device)
   */
  async revokeToken(tokenId: string): Promise<void> {
    await refreshTokenRepository.revoke(tokenId);
  },

  /**
   * Revoke all refresh tokens for a user (logout all devices)
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    return refreshTokenRepository.revokeAllForUser(userId);
  },

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string, currentTokenId?: string) {
    const sessions = await refreshTokenRepository.getActiveSessionsForUser(userId);

    return sessions.map((session) => ({
      id: session.id,
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      isCurrent: session.id === currentTokenId,
    }));
  },
};
