import { eq, and, isNull, ne } from 'drizzle-orm';
import { db } from '@core/db';
import { now, getDbContext, type Transaction } from '@core/db/db.utils';
import { userTokenStates } from '@core/db/schema/auth/user-token-states.schema';
import { users, type User, type NewUser } from '@core/db/schema/user/users.schema';
import { cacheService } from '@core/cache';
import { normalizeEmail } from '@core/utils';

export interface UserAuthState {
  id: string;
  status: User['status'];
}

export interface UserAccessAuthState extends UserAuthState {
  tokenValidAfter: Date | null;
}

interface CachedUserAccessAuthState {
  id: string;
  status: User['status'];
  tokenValidAfter: string | null;
}

const ACCESS_AUTH_STATE_CACHE_PREFIX = 'auth:access-state:';
const ACCESS_AUTH_STATE_CACHE_TTL_SECONDS = 45;

function getAccessAuthStateCacheKey(userId: string): string {
  return `${ACCESS_AUTH_STATE_CACHE_PREFIX}${userId}`;
}

function toCachedAccessAuthState(state: UserAccessAuthState): CachedUserAccessAuthState {
  return {
    id: state.id,
    status: state.status,
    tokenValidAfter: state.tokenValidAfter ? state.tokenValidAfter.toISOString() : null,
  };
}

function fromCachedAccessAuthState(
  cached: CachedUserAccessAuthState
): UserAccessAuthState | undefined {
  if (!cached.id || !cached.status) {
    return undefined;
  }

  const tokenValidAfter = cached.tokenValidAfter ? new Date(cached.tokenValidAfter) : null;
  if (tokenValidAfter && Number.isNaN(tokenValidAfter.getTime())) {
    return undefined;
  }

  return {
    id: cached.id,
    status: cached.status,
    tokenValidAfter,
  };
}

/**
 * User repository for database operations
 */
export const userRepository = {
  /**
   * Create a new user
   */
  async create(data: NewUser): Promise<User> {
    const normalizedData = {
      ...data,
      email: normalizeEmail(data.email),
    };
    await db.insert(users).values(normalizedData);
    const result = await db.select().from(users).where(eq(users.id, data.id)).limit(1);

    return result[0]!;
  },

  /**
   * Find user by email (non-deleted only)
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.email, normalizeEmail(email)), isNull(users.deletedAt)))
      .limit(1);

    return result[0];
  },

  /**
   * Find user by ID (non-deleted only)
   */
  async findById(id: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    return result[0];
  },

  /**
   * Update user's last login information
   */
  async updateLastLogin(userId: string, ipAddress: string | null): Promise<void> {
    await db
      .update(users)
      .set({
        lastLoginAt: now(),
        lastLoginIp: ipAddress,
      })
      .where(eq(users.id, userId));
  },

  /**
   * Check if user exists by email
   */
  async existsByEmail(email: string): Promise<boolean> {
    const result = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, normalizeEmail(email)), isNull(users.deletedAt)))
      .limit(1);

    return result.length > 0;
  },

  /**
   * Check if email exists excluding a specific user
   */
  async existsByEmailExcludingUser(email: string, excludeUserId: string): Promise<boolean> {
    const result = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.email, normalizeEmail(email)),
          isNull(users.deletedAt),
          ne(users.id, excludeUserId)
        )
      )
      .limit(1);

    return result.length > 0;
  },

  /**
   * Check if user exists by username
   */
  async existsByUsername(username: string): Promise<boolean> {
    const result = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), isNull(users.deletedAt)))
      .limit(1);

    return result.length > 0;
  },

  /**
   * Check if username exists excluding a specific user
   */
  async existsByUsernameExcludingUser(username: string, excludeUserId: string): Promise<boolean> {
    const result = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.username, username), isNull(users.deletedAt), ne(users.id, excludeUserId))
      )
      .limit(1);

    return result.length > 0;
  },

  /**
   * Update user's password
   */
  async updatePassword(userId: string, hashedPassword: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx
      .update(users)
      .set({
        password: hashedPassword,
      })
      .where(eq(users.id, userId));
  },

  /**
   * Fetch minimal auth state used by auth middleware.
   */
  async findAuthStateById(userId: string): Promise<UserAuthState | undefined> {
    const accessState = await this.findAccessAuthStateById(userId);
    if (!accessState) {
      return undefined;
    }

    return {
      id: accessState.id,
      status: accessState.status,
    };
  },

  /**
   * Fetch access-token auth state in one query with short-lived cache.
   */
  async findAccessAuthStateById(userId: string): Promise<UserAccessAuthState | undefined> {
    const cacheKey = getAccessAuthStateCacheKey(userId);
    const cached = await cacheService.get<CachedUserAccessAuthState>(cacheKey);
    if (cached) {
      const restored = fromCachedAccessAuthState(cached);
      if (restored) {
        return restored;
      }
      await cacheService.delete(cacheKey);
    }

    const result = await db
      .select({
        id: users.id,
        status: users.status,
        tokenValidAfter: userTokenStates.tokenValidAfter,
      })
      .from(users)
      .leftJoin(userTokenStates, eq(userTokenStates.userId, users.id))
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    const row = result[0];
    if (!row) {
      return undefined;
    }

    const accessState: UserAccessAuthState = {
      id: row.id,
      status: row.status,
      tokenValidAfter: row.tokenValidAfter ?? null,
    };

    await cacheService.set(
      cacheKey,
      toCachedAccessAuthState(accessState),
      ACCESS_AUTH_STATE_CACHE_TTL_SECONDS
    );

    return accessState;
  },

  async invalidateAccessAuthStateCache(userId: string): Promise<void> {
    await cacheService.delete(getAccessAuthStateCacheKey(userId));
  },

  async updateStatus(userId: string, status: User['status'], tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.update(users).set({ status }).where(eq(users.id, userId));
    await this.invalidateAccessAuthStateCache(userId);
  },

  /**
   * Update user profile (username, bio, avatarUrl)
   */
  async updateProfile(
    userId: string,
    data: { username?: string; bio?: string | null; avatarUrl?: string | null }
  ): Promise<User | undefined> {
    await db.update(users).set(data).where(eq(users.id, userId));

    return this.findById(userId);
  },

  /**
   * Update user email and mark it verified
   */
  async updateEmail(userId: string, email: string, tx?: Transaction): Promise<User | undefined> {
    const ctx = getDbContext(tx);
    const normalizedEmail = normalizeEmail(email);

    await ctx
      .update(users)
      .set({
        email: normalizedEmail,
        emailVerified: true,
        emailVerifiedAt: now(),
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    const result = await ctx
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    return result[0];
  },
};
