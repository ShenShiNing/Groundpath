import { eq, and, isNull, ne } from 'drizzle-orm';
import { db } from '@shared/db';
import { now, getDbContext, type Transaction } from '@shared/db/db.utils';
import { users, type User, type NewUser } from '@shared/db/schema/user/users.schema';
import { normalizeEmail } from '@shared/utils';

export interface UserAuthState {
  id: string;
  status: User['status'];
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
    const result = await db
      .select({
        id: users.id,
        status: users.status,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    return result[0];
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
};
