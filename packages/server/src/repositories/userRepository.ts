import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db';
import { users, type User, type NewUser } from '../db/schema/user/users';

/**
 * User repository for database operations
 */
export const userRepository = {
  /**
   * Create a new user
   */
  async create(data: NewUser): Promise<User> {
    await db.insert(users).values(data);
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
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
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
        lastLoginAt: new Date(),
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
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
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
   * Update user's password
   */
  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await db
      .update(users)
      .set({
        password: hashedPassword,
      })
      .where(eq(users.id, userId));
  },
};
