import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { TokenPair, DeviceInfo } from '@knowledge-agent/shared/types';
import { AUTH_CONFIG } from '@config/auth.config';
import type { AccessTokenPayload } from '../types/auth.types';
import { Errors } from '@shared/errors';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '@shared/utils/jwt.utils';
import { withTransaction, type Transaction } from '@shared/db/db.utils';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';
import { userService } from '../../user';

/**
 * Token service for managing JWT token lifecycle
 */
export const tokenService = {
  /**
   * Generate a new token pair (access + refresh)
   */
  async generateTokenPair(
    user: AccessTokenPayload,
    ipAddress: string | null,
    deviceInfo: DeviceInfo | null,
    tx?: Transaction
  ): Promise<TokenPair> {
    // Generate access token
    const accessToken = generateAccessToken(user);

    // Generate refresh token with unique ID
    const tokenId = uuidv4();
    const refreshTokenString = generateRefreshToken(user.sub, tokenId);

    // Store refresh token in database (时间由 MySQL 服务端计算)
    await refreshTokenRepository.create(
      tokenId,
      user.sub,
      refreshTokenString,
      ipAddress,
      deviceInfo,
      tx
    );

    return {
      accessToken,
      refreshToken: refreshTokenString,
      expiresIn: AUTH_CONFIG.accessToken.expiresInSeconds,
      refreshExpiresIn: AUTH_CONFIG.refreshToken.expiresInSeconds,
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
      // Check if token exists and is valid in database
      const storedToken = await refreshTokenRepository.findValidById(payload.jti, tx);
      if (!storedToken) {
        throw Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Refresh token has been revoked');
      }

      // Verify token string matches (extra security)
      if (storedToken.token !== refreshToken) {
        // Token mismatch - possible token reuse attack
        // Revoke all tokens for this user as a security measure
        await refreshTokenRepository.revokeAllForUser(payload.sub, tx);
        throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Token validation failed');
      }

      // Token replay detection: if lastUsedAt was updated very recently,
      // this token may have been stolen and replayed by an attacker.
      // A legitimate client would not refresh the same token twice in quick succession.
      const TOKEN_REPLAY_WINDOW_SECONDS = 5;
      const wasRecentlyUsed = await refreshTokenRepository.wasUsedWithinSeconds(
        payload.jti,
        TOKEN_REPLAY_WINDOW_SECONDS,
        tx
      );

      if (wasRecentlyUsed) {
        // Possible replay attack - revoke all tokens for this user
        await refreshTokenRepository.revokeAllForUser(payload.sub, tx);
        throw Errors.auth(
          AUTH_ERROR_CODES.TOKEN_INVALID,
          'Suspicious token activity detected. All sessions have been revoked.'
        );
      }

      // Mark token as used before revoking
      await refreshTokenRepository.updateLastUsed(payload.jti, tx);

      // Get user to check status
      const user = await userService.findById(payload.sub);
      if (!user) {
        await refreshTokenRepository.revoke(payload.jti, tx);
        throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
      }

      // Check user status
      if (user.status === 'banned') {
        await refreshTokenRepository.revokeAllForUser(user.id, tx);
        throw Errors.auth(AUTH_ERROR_CODES.USER_BANNED, 'User account is banned', 403);
      }

      // Revoke old refresh token (token rotation)
      await refreshTokenRepository.revoke(payload.jti, tx);

      // Generate new token pair
      const accessPayload: AccessTokenPayload = {
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
