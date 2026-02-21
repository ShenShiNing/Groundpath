import { and, eq, gt, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { AuthResponse } from '@knowledge-agent/shared/types';
import { db } from '@shared/db';
import { addSeconds, now } from '@shared/db/db.utils';
import { oauthExchangeCodes } from '@shared/db/schema/auth/oauth-exchange-codes.schema';

function deserializeAuthResponse(payload: string): AuthResponse | null {
  try {
    const parsed = JSON.parse(payload) as AuthResponse & { user: { createdAt: string | Date } };
    return {
      ...parsed,
      user: {
        ...parsed.user,
        createdAt: new Date(parsed.user.createdAt),
      },
    };
  } catch {
    return null;
  }
}

export const oauthExchangeCodeRepository = {
  async create(code: string, authResponse: AuthResponse, ttlSeconds: number): Promise<void> {
    await db.insert(oauthExchangeCodes).values({
      code,
      payload: JSON.stringify(authResponse),
      expiresAt: addSeconds(ttlSeconds),
      consumedAt: null,
    });
  },

  async consume(code: string): Promise<AuthResponse | null> {
    const record = await db
      .select()
      .from(oauthExchangeCodes)
      .where(eq(oauthExchangeCodes.code, code))
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
          eq(oauthExchangeCodes.code, code),
          isNull(oauthExchangeCodes.consumedAt),
          gt(oauthExchangeCodes.expiresAt, now())
        )
      );

    if ((updateResult[0]?.affectedRows ?? 0) === 0) {
      return null;
    }

    return deserializeAuthResponse(row.payload);
  },

  async deleteExpiredAndConsumed(batchSize: number = 500): Promise<number> {
    const candidates = await db
      .select({ code: oauthExchangeCodes.code })
      .from(oauthExchangeCodes)
      .where(
        or(lt(oauthExchangeCodes.expiresAt, now()), isNotNull(oauthExchangeCodes.consumedAt))
      )
      .limit(batchSize);

    if (candidates.length === 0) {
      return 0;
    }

    const codes = candidates.map((item) => item.code);
    const result = await db.delete(oauthExchangeCodes).where(inArray(oauthExchangeCodes.code, codes));

    return result[0]?.affectedRows ?? 0;
  },
};
