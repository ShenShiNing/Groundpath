import { eq, and, gt, or, lt, inArray, sql } from 'drizzle-orm';
import type { DeviceInfo } from '@knowledge-agent/shared/types';
import { db } from '@shared/db';
import { now, addSeconds, getDbContext, type Transaction } from '@shared/db/db.utils';
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
    deviceInfo: DeviceInfo | null,
    tx?: Transaction
  ): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.insert(refreshTokens).values({
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
  async findValidById(tokenId: string, tx?: Transaction): Promise<RefreshToken | undefined> {
    const ctx = getDbContext(tx);
    const result = await ctx
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
   * Check if token was used within the replay window (in seconds)
   * Uses database time comparison to avoid timezone issues
   */
  async wasUsedWithinSeconds(tokenId: string, seconds: number, tx?: Transaction): Promise<boolean> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .select({ count: sql<number>`1` })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.id, tokenId),
          gt(refreshTokens.lastUsedAt, sql`DATE_SUB(NOW(), INTERVAL ${seconds} SECOND)`)
        )
      )
      .limit(1);

    return result.length > 0;
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
  async updateLastUsed(tokenId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.update(refreshTokens).set({ lastUsedAt: now() }).where(eq(refreshTokens.id, tokenId));
  },

  /**
   * Revoke a specific refresh token
   */
  async revoke(tokenId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx
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
  async revokeAllForUser(userId: string, tx?: Transaction): Promise<number> {
    const ctx = getDbContext(tx);
    const result = await ctx
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
