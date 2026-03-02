import { eq, and, gt, or, lt, inArray, sql } from 'drizzle-orm';
import type { DeviceInfo } from '@knowledge-agent/shared/types';
import { db } from '@shared/db';
import { now, addSeconds, getDbContext, type Transaction } from '@shared/db/db.utils';
import { refreshTokens, type RefreshToken } from '@shared/db/schema/auth/refresh-tokens.schema';
import { authConfig } from '@config/env';
import { cacheService } from '@shared/cache';
import { hashRefreshToken } from '@shared/utils/refresh-token.utils';
import { isStoredRefreshTokenMatch } from '@shared/utils/refresh-token.utils';

export type ConsumeRefreshTokenResult =
  | 'consumed'
  | 'not_found'
  | 'token_mismatch'
  | 'expired'
  | 'already_revoked';

const REFRESH_TOKEN_CACHE_TTL_SECONDS = 120;
const REFRESH_TOKEN_CACHE_PREFIX = 'auth:refresh:id:';

function getRefreshTokenCacheKey(tokenId: string): string {
  return `${REFRESH_TOKEN_CACHE_PREFIX}${tokenId}`;
}

interface CachedRefreshToken extends Omit<
  RefreshToken,
  'expiresAt' | 'createdAt' | 'lastUsedAt' | 'revokedAt'
> {
  expiresAt: string | Date;
  createdAt: string | Date;
  lastUsedAt: string | Date;
  revokedAt: string | Date | null;
}

function parseCachedDate(value: string | Date | null): Date | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fromCachedRefreshToken(cached: CachedRefreshToken): RefreshToken | undefined {
  const expiresAt = parseCachedDate(cached.expiresAt);
  const createdAt = parseCachedDate(cached.createdAt);
  const lastUsedAt = parseCachedDate(cached.lastUsedAt);
  const revokedAt = parseCachedDate(cached.revokedAt);

  if (!expiresAt || !createdAt || !lastUsedAt) {
    return undefined;
  }

  return {
    ...cached,
    expiresAt,
    createdAt,
    lastUsedAt,
    revokedAt,
  };
}

function isRefreshTokenUsable(token: RefreshToken): boolean {
  return !token.revoked && token.expiresAt > new Date();
}

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
    const expiresAt = addSeconds(authConfig.refreshToken.expiresInSeconds);
    await ctx.insert(refreshTokens).values({
      id: tokenId,
      userId,
      token: tokenHash,
      ipAddress,
      deviceInfo,
      revoked: false,
      expiresAt,
    });

    // Cache the fresh token for hot-path lookups.
    await cacheService.set(
      getRefreshTokenCacheKey(tokenId),
      {
        id: tokenId,
        userId,
        token: tokenHash,
        ipAddress,
        deviceInfo,
        revoked: false,
        revokedAt: null,
        expiresAt: new Date(Date.now() + authConfig.refreshToken.expiresInSeconds * 1000),
        createdAt: new Date(),
        lastUsedAt: new Date(),
      } satisfies RefreshToken,
      REFRESH_TOKEN_CACHE_TTL_SECONDS
    );
  },

  /**
   * Find a valid (non-revoked, non-expired) refresh token by ID
   */
  async findValidById(tokenId: string, tx?: Transaction): Promise<RefreshToken | undefined> {
    const cacheKey = getRefreshTokenCacheKey(tokenId);
    const cached = await cacheService.get<CachedRefreshToken>(cacheKey);
    if (cached) {
      const restored = fromCachedRefreshToken(cached);
      if (restored && isRefreshTokenUsable(restored)) {
        return restored;
      }
      await cacheService.delete(cacheKey);
    }

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
    const token = result[0];
    if (token) {
      await cacheService.set(cacheKey, token, REFRESH_TOKEN_CACHE_TTL_SECONDS);
    }
    return token;
  },

  /**
   * Find refresh token by ID regardless of status.
   */
  async findById(tokenId: string, tx?: Transaction): Promise<RefreshToken | undefined> {
    const cacheKey = getRefreshTokenCacheKey(tokenId);
    const cached = await cacheService.get<CachedRefreshToken>(cacheKey);
    if (cached) {
      const restored = fromCachedRefreshToken(cached);
      if (restored) {
        return restored;
      }
      await cacheService.delete(cacheKey);
    }

    const ctx = getDbContext(tx);
    const result = await ctx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, tokenId))
      .limit(1);
    const token = result[0];
    if (token) {
      await cacheService.set(cacheKey, token, REFRESH_TOKEN_CACHE_TTL_SECONDS);
    }
    return token;
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
          eq(refreshTokens.token, tokenHash)
        )
      );

    if ((updateResult[0]?.affectedRows ?? 0) > 0) {
      await cacheService.delete(getRefreshTokenCacheKey(tokenId));
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
      .where(eq(refreshTokens.token, tokenHash))
      .limit(1);

    return result[0];
  },

  /**
   * Update last used timestamp
   */
  async updateLastUsed(tokenId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.update(refreshTokens).set({ lastUsedAt: now() }).where(eq(refreshTokens.id, tokenId));
    await cacheService.delete(getRefreshTokenCacheKey(tokenId));
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
    await cacheService.delete(getRefreshTokenCacheKey(tokenId));
  },

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllForUser(userId: string, tx?: Transaction): Promise<number> {
    const ctx = getDbContext(tx);
    const activeTokenRows = await ctx
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.revoked, false)));

    const result = await ctx
      .update(refreshTokens)
      .set({
        revoked: true,
        revokedAt: now(),
      })
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.revoked, false)));

    for (const tokenRow of activeTokenRows) {
      await cacheService.delete(getRefreshTokenCacheKey(tokenRow.id));
    }

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
