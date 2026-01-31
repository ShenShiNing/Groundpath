import { v4 as uuidv4 } from 'uuid';
import { db } from '@shared/db';
import { loginLogs } from '@shared/db/schema/system/loginLogs';

type AuthType = 'email' | 'github' | 'wechat' | 'google' | 'password';

/**
 * Login log repository for recording authentication attempts
 */
export const loginLogRepository = {
  /**
   * Record a successful login attempt
   */
  async recordSuccess(
    userId: string,
    email: string,
    authType: AuthType,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<void> {
    await db.insert(loginLogs).values({
      id: uuidv4(),
      userId,
      email,
      authType,
      success: true,
      failureReason: null,
      ipAddress,
      userAgent,
      location: null,
    });
  },

  /**
   * Record a failed login attempt
   */
  async recordFailure(
    email: string,
    authType: AuthType,
    failureReason: string,
    ipAddress: string | null,
    userAgent: string | null,
    userId?: string
  ): Promise<void> {
    await db.insert(loginLogs).values({
      id: uuidv4(),
      userId: userId ?? null,
      email,
      authType,
      success: false,
      failureReason,
      ipAddress,
      userAgent,
      location: null,
    });
  },
};
