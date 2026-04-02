import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@groundpath/shared';
import type { TokenPair, DeviceInfo } from '@groundpath/shared/types';
import { authConfig } from '@config/env';
import type { User } from '@core/db/schema/user/users.schema';
import type { AccessTokenSubject } from '@core/types';
import { AppError, Errors } from '@core/errors';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  buildAccessTokenSubject,
} from '@core/utils';
import { withTransaction, type Transaction } from '@core/db/db.utils';
import { systemLogger } from '@core/logger/system-logger';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';
import { userTokenStateRepository } from '../repositories/user-token-state.repository';
import { userService } from '@modules/user/public/management';

export interface RefreshTokensResult {
  tokens: TokenPair;
  userId: string;
}

type VerifiedRefreshTokenPayload = ReturnType<typeof verifyRefreshToken>;
type RefreshTokensTransactionResult = RefreshTokensResult | AppError;

async function revokeUserSessionsAndInvalidateAccess(
  userId: string,
  tx: Transaction
): Promise<number> {
  const revokedSessions = await refreshTokenRepository.revokeAllForUser(userId, tx);
  await userTokenStateRepository.bumpTokenValidAfter(userId, tx);
  return revokedSessions;
}

async function consumeRefreshTokenOrError(input: {
  payload: VerifiedRefreshTokenPayload;
  refreshToken: string;
  ipAddress: string | null;
  deviceInfo: DeviceInfo | null;
  tx: Transaction;
}): Promise<AppError | null> {
  const consumeResult = await refreshTokenRepository.consumeIfValid(
    input.payload.sid,
    input.refreshToken,
    input.tx
  );

  if (consumeResult === 'token_mismatch') {
    const revokedSessions = await revokeUserSessionsAndInvalidateAccess(
      input.payload.sub,
      input.tx
    );
    systemLogger.securityEvent(
      'auth.refresh.token_mismatch',
      'Refresh token mismatch detected, revoked all user sessions',
      {
        userId: input.payload.sub,
        tokenId: input.payload.sid,
        action: 'revoke_all_sessions',
        sessionsRevoked: revokedSessions,
        ipAddress: input.ipAddress,
        deviceInfo: input.deviceInfo,
      }
    );
    return Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Token validation failed');
  }

  if (consumeResult === 'already_revoked') {
    const revokedSessions = await revokeUserSessionsAndInvalidateAccess(
      input.payload.sub,
      input.tx
    );
    systemLogger.securityEvent(
      'auth.refresh.replay_blocked',
      'Refresh token replay detected, revoked all user sessions',
      {
        userId: input.payload.sub,
        tokenId: input.payload.sid,
        action: 'revoke_all_sessions',
        sessionsRevoked: revokedSessions,
        ipAddress: input.ipAddress,
        deviceInfo: input.deviceInfo,
      }
    );
    return Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Refresh token has already been used');
  }

  if (consumeResult === 'expired') {
    return Errors.auth(AUTH_ERROR_CODES.TOKEN_EXPIRED, 'Refresh token has expired');
  }

  if (consumeResult === 'not_found') {
    return Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Refresh token has been revoked');
  }

  return null;
}

async function validateRefreshUserOrError(
  userId: string,
  tx: Transaction
): Promise<User | AppError> {
  const user = await userService.findById(userId);
  if (!user) {
    return Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
  }

  if (user.status === 'banned') {
    await revokeUserSessionsAndInvalidateAccess(user.id, tx);
    return Errors.auth(AUTH_ERROR_CODES.USER_BANNED, 'User account is banned', 403);
  }

  return user;
}

async function issueRefreshedTokens(input: {
  user: User;
  ipAddress: string | null;
  deviceInfo: DeviceInfo | null;
  tx: Transaction;
}): Promise<RefreshTokensResult> {
  const tokens = await tokenService.generateTokenPair(
    buildAccessTokenSubject(input.user),
    input.ipAddress,
    input.deviceInfo,
    input.tx
  );

  return {
    tokens,
    userId: input.user.id,
  };
}

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
  ): Promise<RefreshTokensResult> {
    // Verify the JWT signature and structure (outside transaction - no DB involved)
    const payload = verifyRefreshToken(refreshToken);

    const result = await withTransaction<RefreshTokensTransactionResult>(async (tx) => {
      const consumeError = await consumeRefreshTokenOrError({
        payload,
        refreshToken,
        ipAddress,
        deviceInfo,
        tx,
      });
      if (consumeError) {
        return consumeError;
      }

      const user = await validateRefreshUserOrError(payload.sub, tx);
      if (user instanceof AppError) {
        return user;
      }

      return issueRefreshedTokens({
        user,
        ipAddress,
        deviceInfo,
        tx,
      });
    });

    if (result instanceof AppError) {
      throw result;
    }

    return result;
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
