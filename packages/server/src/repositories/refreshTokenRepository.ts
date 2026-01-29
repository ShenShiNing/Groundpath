import { eq, and, gt } from 'drizzle-orm';
import type { DeviceInfo } from '@knowledge-agent/shared/types';
import { db } from '../db';
import {
  refreshTokens,
  type RefreshToken,
  type NewRefreshToken,
} from '../db/schema/auth/refreshTokens';

/**
 * Refresh token repository for database operations
 */
export const refreshTokenRepository = {
  /**
   * Create a new refresh token record
   */
  async create(
    tokenId: string,
    userId: string,
    token: string,
    expiresAt: Date,
    ipAddress: string | null,
    deviceInfo: DeviceInfo | null
  ): Promise<RefreshToken> {
    const id = tokenId;
    const newToken: NewRefreshToken = {
      id,
      userId,
      token,
      expiresAt,
      ipAddress,
      deviceInfo,
      revoked: false,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };

    await db.insert(refreshTokens).values(newToken);

    return {
      ...newToken,
      revokedAt: null,
    } as RefreshToken;
  },

  /**
   * Find a valid (non-revoked, non-expired) refresh token by ID
   */
  async findValidById(tokenId: string): Promise<RefreshToken | undefined> {
    const result = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.id, tokenId),
          eq(refreshTokens.revoked, false),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    return result[0];
  },

  /**
   * Find refresh token by token string
   */
  async findByToken(token: string): Promise<RefreshToken | undefined> {
    const result = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token))
      .limit(1);

    return result[0];
  },

  /**
   * Update last used timestamp
   */
  async updateLastUsed(tokenId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(refreshTokens.id, tokenId));
  },

  /**
   * Revoke a specific refresh token
   */
  async revoke(tokenId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: new Date(),
      })
      .where(eq(refreshTokens.id, tokenId));
  },

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await db
      .update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: new Date(),
      })
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.revoked, false)));

    return result[0]?.affectedRows ?? 0;
  },

  /**
   * Get all active sessions for a user
   */
  async getActiveSessionsForUser(userId: string): Promise<RefreshToken[]> {
    return db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.revoked, false),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .orderBy(refreshTokens.lastUsedAt);
  },

  /**
   * Delete expired tokens (cleanup job)
   */
  async deleteExpired(): Promise<number> {
    const result = await db.delete(refreshTokens).where(and(eq(refreshTokens.revoked, true)));

    return result[0]?.affectedRows ?? 0;
  },
};
