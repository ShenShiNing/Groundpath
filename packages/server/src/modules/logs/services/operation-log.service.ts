import type { OperationLog } from '@shared/db/schema/system/operation-logs.schema';
import { buildPagination } from '@shared/utils';
import {
  operationLogRepository,
  type OperationLogListParams,
} from '../repositories/operation-log.repository';

export interface OperationLogListItem {
  id: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  action: string;
  description: string | null;
  status: string;
  ipAddress: string | null;
  createdAt: Date;
}

export interface OperationLogDetail extends OperationLogListItem {
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  userAgent: string | null;
  errorMessage: string | null;
  durationMs: number | null;
}

export interface OperationLogListResponse {
  logs: OperationLogListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Convert database operation log to list item
 */
function toOperationLogListItem(log: OperationLog): OperationLogListItem {
  return {
    id: log.id,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    resourceName: log.resourceName,
    action: log.action,
    description: log.description,
    status: log.status,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  };
}

/**
 * Convert database operation log to detail item
 */
function toOperationLogDetail(log: OperationLog): OperationLogDetail {
  return {
    ...toOperationLogListItem(log),
    oldValue: log.oldValue,
    newValue: log.newValue,
    metadata: log.metadata,
    userAgent: log.userAgent,
    errorMessage: log.errorMessage,
    durationMs: log.durationMs,
  };
}

export const operationLogService = {
  /**
   * List operation logs for a user with pagination
   */
  async list(userId: string, params: OperationLogListParams): Promise<OperationLogListResponse> {
    const { logs, total } = await operationLogRepository.list(userId, params);

    return {
      logs: logs.map(toOperationLogListItem),
      pagination: buildPagination(total, params.page, params.pageSize),
    };
  },

  /**
   * Get operation history for a specific resource
   */
  async getResourceHistory(
    resourceType: 'document' | 'knowledge_base' | 'user' | 'session',
    resourceId: string,
    userId: string,
    limit: number = 50
  ): Promise<OperationLogDetail[]> {
    const logs = await operationLogRepository.listByResource(
      resourceType,
      resourceId,
      userId,
      limit
    );
    return logs.map(toOperationLogDetail);
  },
};
