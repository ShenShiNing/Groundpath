import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { userAuths, type UserAuth, type NewUserAuth } from '../db/schema/auth/userAuths';

type AuthType = 'email' | 'github' | 'wechat' | 'google' | 'password';

/**
 * User auth repository for OAuth and third-party authentication records
 */
export const userAuthRepository = {
  /**
   * Find auth record by auth type and external ID
   */
  async findByAuthTypeAndId(authType: AuthType, authId: string): Promise<UserAuth | undefined> {
    const result = await db
      .select()
      .from(userAuths)
      .where(and(eq(userAuths.authType, authType), eq(userAuths.authId, authId)))
      .limit(1);

    return result[0];
  },

  /**
   * Create a new auth record
   */
  async create(data: NewUserAuth): Promise<UserAuth> {
    await db.insert(userAuths).values(data);
    const result = await db.select().from(userAuths).where(eq(userAuths.id, data.id)).limit(1);

    return result[0]!;
  },

  /**
   * Update auth data (OAuth tokens, profile info)
   */
  async updateAuthData(
    id: string,
    authData: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
      profile?: Record<string, unknown>;
    }
  ): Promise<void> {
    await db.update(userAuths).set({ authData }).where(eq(userAuths.id, id));
  },

  /**
   * Find all auth records for a user
   */
  async findByUserId(userId: string): Promise<UserAuth[]> {
    return db.select().from(userAuths).where(eq(userAuths.userId, userId));
  },
};
