import { eq, and, gt, or, lt, inArray } from 'drizzle-orm';
import type { DeviceInfo } from '@knowledge-agent/shared/types';
import { db } from '@shared/db';
import { now, addSeconds } from '@shared/db/db.utils';
import { refreshTokens, type RefreshToken } from '@shared/db/schema/auth/refresh-tokens.schema';
import { AUTH_CONFIG } from '@config/auth.config';

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
    ipAddress: string | null,
    deviceInfo: DeviceInfo | null
  ): Promise<void> {
    await db.insert(refreshTokens).values({
      id: tokenId,
      userId,
      token,
      ipAddress,
      deviceInfo,
      revoked: false,
      expiresAt: addSeconds(AUTH_CONFIG.refreshToken.expiresInSeconds),
    });
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
          gt(refreshTokens.expiresAt, now())
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
    await db.update(refreshTokens).set({ lastUsedAt: now() }).where(eq(refreshTokens.id, tokenId));
  },

  /**
   * Revoke a specific refresh token
   */
  async revoke(tokenId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: now(),
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
        revokedAt: now(),
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
          gt(refreshTokens.expiresAt, now())
        )
      )
      .orderBy(refreshTokens.lastUsedAt);
  },

  /**
   * Delete invalid tokens in batches (revoked or expired)
   */
  async deleteInvalid(batchSize: number = 1000): Promise<number> {
    const invalidTokens = await db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(or(eq(refreshTokens.revoked, true), lt(refreshTokens.expiresAt, now())))
      .limit(batchSize);

    if (invalidTokens.length === 0) return 0;

    const ids = invalidTokens.map((t) => t.id);
    const result = await db.delete(refreshTokens).where(inArray(refreshTokens.id, ids));

    return result[0]?.affectedRows ?? 0;
  },
};
