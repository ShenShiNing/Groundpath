import { and, eq, gt, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '@core/db';
import { addSeconds, now } from '@core/db/db.utils';
import { oauthExchangeCodes } from '@core/db/schema/auth/oauth-exchange-codes.schema';
import { hashOAuthExchangeCode } from '@core/utils';

export interface OAuthExchangeCodeContext {
  userId: string;
  returnUrl: string;
}

export const oauthExchangeCodeRepository = {
  async create(code: string, userId: string, returnUrl: string, ttlSeconds: number): Promise<void> {
    const codeHash = hashOAuthExchangeCode(code);
    await db.insert(oauthExchangeCodes).values({
      codeHash,
      userId,
      returnUrl,
      expiresAt: addSeconds(ttlSeconds),
      consumedAt: null,
    });
  },

  async consume(code: string, userId: string): Promise<OAuthExchangeCodeContext | null> {
    const codeHash = hashOAuthExchangeCode(code);
    const record = await db
      .select({
        userId: oauthExchangeCodes.userId,
        returnUrl: oauthExchangeCodes.returnUrl,
        consumedAt: oauthExchangeCodes.consumedAt,
        expiresAt: oauthExchangeCodes.expiresAt,
      })
      .from(oauthExchangeCodes)
      .where(and(eq(oauthExchangeCodes.codeHash, codeHash), eq(oauthExchangeCodes.userId, userId)))
      .limit(1);

    const row = record[0];
    if (!row || row.consumedAt || row.expiresAt <= new Date()) {
      return null;
    }

    const updateResult = await db
      .update(oauthExchangeCodes)
      .set({ consumedAt: now() })
      .where(
        and(
          eq(oauthExchangeCodes.codeHash, codeHash),
          eq(oauthExchangeCodes.userId, userId),
          isNull(oauthExchangeCodes.consumedAt),
          gt(oauthExchangeCodes.expiresAt, now())
        )
      );

    if ((updateResult[0]?.affectedRows ?? 0) === 0) {
      return null;
    }

    return {
      userId: row.userId,
      returnUrl: row.returnUrl,
    };
  },

  async deleteExpiredAndConsumed(batchSize: number = 500): Promise<number> {
    const candidates = await db
      .select({ codeHash: oauthExchangeCodes.codeHash })
      .from(oauthExchangeCodes)
      .where(or(lt(oauthExchangeCodes.expiresAt, now()), isNotNull(oauthExchangeCodes.consumedAt)))
      .limit(batchSize);

    if (candidates.length === 0) {
      return 0;
    }

    const codeHashes = candidates.map((item) => item.codeHash);
    const result = await db
      .delete(oauthExchangeCodes)
      .where(inArray(oauthExchangeCodes.codeHash, codeHashes));

    return result[0]?.affectedRows ?? 0;
  },
};
