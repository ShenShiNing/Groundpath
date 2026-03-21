import { eq } from 'drizzle-orm';
import { db } from '@core/db';
import { getDbContext, now, type Transaction } from '@core/db/db.utils';
import { userTokenStates } from '@core/db/schema/auth/user-token-states.schema';
import { userRepository } from '@modules/user/public/repositories';

export const userTokenStateRepository = {
  async getTokenValidAfter(userId: string): Promise<Date | null> {
    const result = await db
      .select({ tokenValidAfter: userTokenStates.tokenValidAfter })
      .from(userTokenStates)
      .where(eq(userTokenStates.userId, userId))
      .limit(1);
    return result[0]?.tokenValidAfter ?? null;
  },

  async bumpTokenValidAfter(userId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx
      .insert(userTokenStates)
      .values({
        userId,
        tokenValidAfter: now(),
      })
      .onDuplicateKeyUpdate({
        set: {
          tokenValidAfter: now(),
          updatedAt: now(),
        },
      });

    await userRepository.invalidateAccessAuthStateCache(userId);
  },
};
