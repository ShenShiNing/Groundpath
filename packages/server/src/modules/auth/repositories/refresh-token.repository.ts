import { eq, and, gt, or, lt, inArray, sql } from 'drizzle-orm';
import type { DeviceInfo } from '@knowledge-agent/shared/types';
import { db } from '@shared/db';
import { now, addSeconds, getDbContext, type Transaction } from '@shared/db/db.utils';
import { refreshTokens, type RefreshToken } from '@shared/db/schema/auth/refresh-tokens.schema';
import { authConfig } from '@config/env';
import { hashRefreshToken } from '@shared/utils/refresh-token.utils';
import { isStoredRefreshTokenMatch } from '@shared/utils/refresh-token.utils';

export type ConsumeRefreshTokenResult =
  | 'consumed'
  | 'not_found'
  | 'token_mismatch'
  | 'expired'
  | 'already_revoked';

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
    const tokenHash = hashRefreshToken(token);
    await ctx.insert(refreshTokens).values({
      id: tokenId,
      userId,
      token: tokenHash,
      ipAddress,
      deviceInfo,
      revoked: false,
      expiresAt: addSeconds(authConfig.refreshToken.expiresInSeconds),
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
   * Find refresh token by ID regardless of status.
   */
  async findById(tokenId: string, tx?: Transaction): Promise<RefreshToken | undefined> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, tokenId))
      .limit(1);

    return result[0];
  },

  /**
   * Atomically consume a refresh token exactly once.
   * Success means the token is revoked and cannot be reused.
   */
  async consumeIfValid(
    tokenId: string,
    token: string,
    tx?: Transaction
  ): Promise<ConsumeRefreshTokenResult> {
    const ctx = getDbContext(tx);
    const tokenHash = hashRefreshToken(token);

    const updateResult = await ctx
      .update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: now(),
        lastUsedAt: now(),
      })
      .where(
        and(
          eq(refreshTokens.id, tokenId),
          eq(refreshTokens.revoked, false),
          gt(refreshTokens.expiresAt, now()),
          or(eq(refreshTokens.token, tokenHash), eq(refreshTokens.token, token))
        )
      );

    if ((updateResult[0]?.affectedRows ?? 0) > 0) {
      return 'consumed';
    }

    const existing = await this.findById(tokenId, tx);
    if (!existing) {
      return 'not_found';
    }
    if (!isStoredRefreshTokenMatch(existing.token, token)) {
      return 'token_mismatch';
    }
    if (existing.expiresAt <= new Date()) {
      return 'expired';
    }
    if (existing.revoked) {
      return 'already_revoked';
    }
    return 'not_found';
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
          gt(refreshTokens.lastUsedAt, refreshTokens.createdAt),
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
    const tokenHash = hashRefreshToken(token);
    const result = await db
      .select()
      .from(refreshTokens)
      .where(or(eq(refreshTokens.token, tokenHash), eq(refreshTokens.token, token)))
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
