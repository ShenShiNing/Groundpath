import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { TokenPair, DeviceInfo } from '@knowledge-agent/shared/types';
import { AUTH_CONFIG } from '../config/authConfig';
import type { AccessTokenPayload } from '../types/authTypes';
import { AuthError } from '../utils/errors';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwtUtils';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository';
import { userRepository } from '../repositories/userRepository';

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
    deviceInfo: DeviceInfo | null
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
      deviceInfo
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
   */
  async refreshTokens(
    refreshToken: string,
    ipAddress: string | null,
    deviceInfo: DeviceInfo | null
  ): Promise<TokenPair> {
    // Verify the JWT signature and structure
    const payload = verifyRefreshToken(refreshToken);

    // Check if token exists and is valid in database
    const storedToken = await refreshTokenRepository.findValidById(payload.jti);
    if (!storedToken) {
      throw new AuthError(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Refresh token has been revoked');
    }

    // Verify token string matches (extra security)
    if (storedToken.token !== refreshToken) {
      // Token mismatch - possible token reuse attack
      // Revoke all tokens for this user as a security measure
      await refreshTokenRepository.revokeAllForUser(payload.sub);
      throw new AuthError(AUTH_ERROR_CODES.TOKEN_INVALID, 'Token validation failed');
    }

    // Get user to check status
    const user = await userRepository.findById(payload.sub);
    if (!user) {
      await refreshTokenRepository.revoke(payload.jti);
      throw new AuthError(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }

    // Check user status
    if (user.status === 'banned') {
      await refreshTokenRepository.revokeAllForUser(user.id);
      throw new AuthError(AUTH_ERROR_CODES.USER_BANNED, 'User account is banned', 403);
    }

    // Revoke old refresh token (token rotation)
    await refreshTokenRepository.revoke(payload.jti);

    // Generate new token pair
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      status: user.status,
      emailVerified: user.emailVerified,
    };

    return this.generateTokenPair(accessPayload, ipAddress, deviceInfo);
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
