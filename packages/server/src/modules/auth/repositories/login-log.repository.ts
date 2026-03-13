import { v4 as uuidv4 } from 'uuid';
import { desc, eq, lt, sql, inArray, and } from 'drizzle-orm';
import { db } from '@core/db';
import { loginLogs, type LoginLog } from '@core/db/schema/system/login-logs.schema';
import type { DeviceDetectionInfo } from '../../logs/services/device-detection.service';
import type { GeoLocationInfo } from '../../logs/services/geo-location.service';
import { createLogger } from '@core/logger';

const logger = createLogger('login-log.repository');

type AuthType = 'email' | 'github' | 'wechat' | 'google' | 'password';

export interface LoginLogListParams {
  page: number;
  pageSize: number;
  success?: boolean;
  authType?: AuthType;
  startDate?: Date;
  endDate?: Date;
}

export interface EnhancedLoginInfo {
  deviceInfo?: DeviceDetectionInfo | null;
  geoInfo?: GeoLocationInfo | null;
}

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
    userAgent: string | null,
    enhanced?: EnhancedLoginInfo
  ): Promise<void> {
    logger.info({ enhanced }, 'Recording login success with enhanced info');

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
      // Device info
      deviceType: enhanced?.deviceInfo?.deviceType ?? null,
      browser: enhanced?.deviceInfo?.browser ?? null,
      browserVersion: enhanced?.deviceInfo?.browserVersion ?? null,
      os: enhanced?.deviceInfo?.os ?? null,
      osVersion: enhanced?.deviceInfo?.osVersion ?? null,
      // Geo info
      country: enhanced?.geoInfo?.country ?? null,
      countryName: enhanced?.geoInfo?.countryName ?? null,
      region: enhanced?.geoInfo?.region ?? null,
      city: enhanced?.geoInfo?.city ?? null,
      timezone: enhanced?.geoInfo?.timezone ?? null,
      isp: enhanced?.geoInfo?.isp ?? null,
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
    userId?: string,
    enhanced?: EnhancedLoginInfo
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
      // Device info
      deviceType: enhanced?.deviceInfo?.deviceType ?? null,
      browser: enhanced?.deviceInfo?.browser ?? null,
      browserVersion: enhanced?.deviceInfo?.browserVersion ?? null,
      os: enhanced?.deviceInfo?.os ?? null,
      osVersion: enhanced?.deviceInfo?.osVersion ?? null,
      // Geo info
      country: enhanced?.geoInfo?.country ?? null,
      countryName: enhanced?.geoInfo?.countryName ?? null,
      region: enhanced?.geoInfo?.region ?? null,
      city: enhanced?.geoInfo?.city ?? null,
      timezone: enhanced?.geoInfo?.timezone ?? null,
      isp: enhanced?.geoInfo?.isp ?? null,
    });
  },

  /**
   * List login logs with pagination and filtering
   */
  async list(
    userId: string,
    params: LoginLogListParams
  ): Promise<{ logs: LoginLog[]; total: number }> {
    const { page, pageSize, success, authType, startDate, endDate } = params;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(loginLogs.userId, userId)];

    if (success !== undefined) {
      conditions.push(eq(loginLogs.success, success));
    }
    if (authType) {
      conditions.push(eq(loginLogs.authType, authType));
    }
    if (startDate) {
      conditions.push(sql`${loginLogs.createdAt} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${loginLogs.createdAt} <= ${endDate}`);
    }

    const whereClause = and(...conditions);

    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(loginLogs)
        .where(whereClause)
        .orderBy(desc(loginLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(loginLogs)
        .where(whereClause),
    ]);

    return {
      logs,
      total: countResult[0]?.count ?? 0,
    };
  },

  /**
   * List recent login logs by user
   */
  async listByUser(userId: string, limit: number = 50): Promise<LoginLog[]> {
    return db
      .select()
      .from(loginLogs)
      .where(eq(loginLogs.userId, userId))
      .orderBy(desc(loginLogs.createdAt))
      .limit(limit);
  },

  /**
   * Delete logs older than specified date (for cleanup)
   */
  async deleteOlderThan(date: Date, batchSize: number = 1000): Promise<number> {
    // Get IDs of old logs in batches
    const oldLogs = await db
      .select({ id: loginLogs.id })
      .from(loginLogs)
      .where(lt(loginLogs.createdAt, date))
      .limit(batchSize);

    if (oldLogs.length === 0) {
      return 0;
    }

    const ids = oldLogs.map((log) => log.id);
    await db.delete(loginLogs).where(inArray(loginLogs.id, ids));

    return ids.length;
  },
};
