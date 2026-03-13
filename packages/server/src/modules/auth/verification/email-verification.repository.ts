import { eq, and, gt, desc, sql } from 'drizzle-orm';
import type { EmailVerificationCodeType } from '@knowledge-agent/shared/types';
import { db } from '@core/db';
import { now, addMinutes, subtractSeconds } from '@core/db/db.utils';
import {
  emailVerificationCodes,
  type EmailVerificationCode,
} from '@core/db/schema/auth/email-verification-codes.schema';
import { emailConfig } from '@config/env';

/**
 * Email verification code repository for database operations
 */
export const emailVerificationRepository = {
  /**
   * Create a new verification code
   */
  async create(
    id: string,
    email: string,
    code: string,
    type: EmailVerificationCodeType,
    ipAddress: string | null
  ): Promise<void> {
    await db.insert(emailVerificationCodes).values({
      id,
      email: email.toLowerCase().trim(),
      code,
      type,
      ipAddress,
      used: false,
      expiresAt: addMinutes(emailConfig.verification.codeExpiresInMinutes),
    });
  },

  /**
   * Find a valid (unused, non-expired) code for an email and type
   */
  async findValidCode(
    email: string,
    code: string,
    type: EmailVerificationCodeType
  ): Promise<EmailVerificationCode | undefined> {
    const result = await db
      .select()
      .from(emailVerificationCodes)
      .where(
        and(
          eq(emailVerificationCodes.email, email.toLowerCase().trim()),
          eq(emailVerificationCodes.code, code),
          eq(emailVerificationCodes.type, type),
          eq(emailVerificationCodes.used, false),
          gt(emailVerificationCodes.expiresAt, now())
        )
      )
      .limit(1);

    return result[0];
  },

  /**
   * Mark a code as used
   */
  async markAsUsed(codeId: string): Promise<void> {
    await db
      .update(emailVerificationCodes)
      .set({
        used: true,
        usedAt: now(),
      })
      .where(eq(emailVerificationCodes.id, codeId));
  },

  /**
   * Count codes sent to an email in the last hour (using server time)
   */
  async countRecentCodes(email: string, type: EmailVerificationCodeType): Promise<number> {
    const oneHourAgo = subtractSeconds(60 * 60);

    const result = await db
      .select()
      .from(emailVerificationCodes)
      .where(
        and(
          eq(emailVerificationCodes.email, email.toLowerCase().trim()),
          eq(emailVerificationCodes.type, type),
          gt(emailVerificationCodes.createdAt, oneHourAgo)
        )
      );

    return result.length;
  },

  /**
   * Get the most recent code sent to an email for a type
   */
  async getMostRecentCode(
    email: string,
    type: EmailVerificationCodeType
  ): Promise<EmailVerificationCode | undefined> {
    const result = await db
      .select()
      .from(emailVerificationCodes)
      .where(
        and(
          eq(emailVerificationCodes.email, email.toLowerCase().trim()),
          eq(emailVerificationCodes.type, type)
        )
      )
      .orderBy(desc(emailVerificationCodes.createdAt))
      .limit(1);

    return result[0];
  },

  /**
   * Get the most recent code with server-calculated seconds since creation
   * This avoids timezone issues between client and server
   */
  async getMostRecentCodeWithAge(
    email: string,
    type: EmailVerificationCodeType
  ): Promise<{ code: EmailVerificationCode; secondsSinceCreation: number } | undefined> {
    const result = await db
      .select({
        code: emailVerificationCodes,
        secondsSinceCreation: sql<number>`TIMESTAMPDIFF(SECOND, ${emailVerificationCodes.createdAt}, NOW())`,
      })
      .from(emailVerificationCodes)
      .where(
        and(
          eq(emailVerificationCodes.email, email.toLowerCase().trim()),
          eq(emailVerificationCodes.type, type)
        )
      )
      .orderBy(desc(emailVerificationCodes.createdAt))
      .limit(1);

    if (!result[0]) return undefined;

    return {
      code: result[0].code,
      secondsSinceCreation: result[0].secondsSinceCreation,
    };
  },

  /**
   * Invalidate all unused codes for an email and type
   */
  async invalidateAllForEmail(email: string, type: EmailVerificationCodeType): Promise<void> {
    await db
      .update(emailVerificationCodes)
      .set({
        used: true,
        usedAt: now(),
      })
      .where(
        and(
          eq(emailVerificationCodes.email, email.toLowerCase().trim()),
          eq(emailVerificationCodes.type, type),
          eq(emailVerificationCodes.used, false)
        )
      );
  },

  /**
   * Delete expired codes (cleanup job)
   */
  async deleteExpired(): Promise<number> {
    const result = await db
      .delete(emailVerificationCodes)
      .where(
        and(eq(emailVerificationCodes.used, true), gt(now(), emailVerificationCodes.expiresAt))
      );

    return result[0]?.affectedRows ?? 0;
  },
};
