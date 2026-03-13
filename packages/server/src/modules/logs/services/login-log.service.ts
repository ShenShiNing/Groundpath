import type { LoginLog } from '@core/db/schema/system/login-logs.schema';
import type { PaginationMeta } from '@core/utils';
import { buildPagination } from '@core/utils';
import {
  loginLogRepository,
  type LoginLogListParams,
} from '../../auth/repositories/login-log.repository';

export interface LoginLogListItem {
  id: string;
  authType: string;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  countryName: string | null;
  city: string | null;
  createdAt: Date;
}

export interface LoginLogListResponse {
  logs: LoginLogListItem[];
  pagination: PaginationMeta;
}

/**
 * Convert database login log to list item
 */
function toLoginLogListItem(log: LoginLog): LoginLogListItem {
  return {
    id: log.id,
    authType: log.authType,
    success: log.success,
    failureReason: log.failureReason,
    ipAddress: log.ipAddress,
    deviceType: log.deviceType,
    browser: log.browser,
    os: log.os,
    country: log.country,
    countryName: log.countryName,
    city: log.city,
    createdAt: log.createdAt,
  };
}

export const loginLogService = {
  /**
   * List login logs for a user with pagination
   */
  async list(userId: string, params: LoginLogListParams): Promise<LoginLogListResponse> {
    const { logs, total } = await loginLogRepository.list(userId, params);

    return {
      logs: logs.map(toLoginLogListItem),
      pagination: buildPagination(total, params.page, params.pageSize),
    };
  },

  /**
   * Get recent login logs for a user
   */
  async getRecent(userId: string, limit: number = 10): Promise<LoginLogListItem[]> {
    const logs = await loginLogRepository.listByUser(userId, limit);
    return logs.map(toLoginLogListItem);
  },
};
