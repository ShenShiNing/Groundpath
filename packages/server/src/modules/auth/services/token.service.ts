import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { TokenPair, DeviceInfo } from '@knowledge-agent/shared/types';
import { authConfig } from '@config/env';
import type { User } from '@shared/db/schema/user/users.schema';
import type { AccessTokenSubject } from '@shared/types';
import { Errors } from '@shared/errors';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  buildAccessTokenSubject,
} from '@shared/utils';
import { withTransaction, type Transaction } from '@shared/db/db.utils';
import { systemLogger } from '@shared/logger/system-logger';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';
import { userTokenStateRepository } from '../repositories/user-token-state.repository';
import { userService } from '../../user';

export interface RefreshTokensResult {
  tokens: TokenPair;
  userId: string;
}

type VerifiedRefreshTokenPayload = ReturnType<typeof verifyRefreshToken>;

async function revokeUserSessionsAndInvalidateAccess(
  userId: string,
  tx: Transaction
): Promise<void> {
  await refreshTokenRepository.revokeAllForUser(userId, tx);
  await userTokenStateRepository.bumpTokenValidAfter(userId, tx);
}

async function consumeRefreshTokenOrThrow(input: {
  payload: VerifiedRefreshTokenPayload;
  refreshToken: string;
  ipAddress: string | null;
  deviceInfo: DeviceInfo | null;
  tx: Transaction;
}): Promise<void> {
  const consumeResult = await refreshTokenRepository.consumeIfValid(
    input.payload.sid,
    input.refreshToken,
    input.tx
  );

  if (consumeResult === 'token_mismatch') {
    await refreshTokenRepository.revoke(input.payload.sid, input.tx);
    systemLogger.securityEvent(
      'auth.refresh.token_mismatch',
      'Refresh token mismatch detected, revoked suspicious session',
      {
        userId: input.payload.sub,
        tokenId: input.payload.sid,
        action: 'revoke_session',
        ipAddress: input.ipAddress,
        deviceInfo: input.deviceInfo,
      }
    );
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Token validation failed');
  }

  if (consumeResult === 'already_revoked') {
    systemLogger.securityEvent(
      'auth.refresh.replay_blocked',
      'Replay attempt blocked by atomic refresh token consumption',
      {
        userId: input.payload.sub,
        tokenId: input.payload.sid,
        ipAddress: input.ipAddress,
        deviceInfo: input.deviceInfo,
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
}

async function validateRefreshUserOrThrow(userId: string, tx: Transaction): Promise<User> {
  const user = await userService.findById(userId);
  if (!user) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
  }

  if (user.status === 'banned') {
    await revokeUserSessionsAndInvalidateAccess(user.id, tx);
    throw Errors.auth(AUTH_ERROR_CODES.USER_BANNED, 'User account is banned', 403);
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

    return withTransaction(async (tx) => {
      await consumeRefreshTokenOrThrow({
        payload,
        refreshToken,
        ipAddress,
        deviceInfo,
        tx,
      });

      const user = await validateRefreshUserOrThrow(payload.sub, tx);
      return issueRefreshedTokens({
        user,
        ipAddress,
        deviceInfo,
        tx,
      });
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
