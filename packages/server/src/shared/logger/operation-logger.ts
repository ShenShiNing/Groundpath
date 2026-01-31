import { createLogger } from '@shared/logger';
import {
  operationLogRepository,
  type CreateOperationLogInput,
} from '@modules/logs/repositories/operation-log.repository';
import type { ResourceType, OperationAction } from '@shared/db/schema/system/operation-logs.schema';

const logger = createLogger('operation-logger');

export interface LogOperationParams {
  userId: string;
  resourceType: ResourceType;
  resourceId?: string | null;
  resourceName?: string | null;
  action: OperationAction;
  description?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  durationMs?: number | null;
}

/**
 * Log an operation asynchronously (fire-and-forget)
 * Errors are caught and logged but do not block the main flow
 */
export function logOperation(params: LogOperationParams): void {
  const startTime = Date.now();

  const input: CreateOperationLogInput = {
    ...params,
    status: 'success',
    durationMs: params.durationMs ?? null,
  };

  operationLogRepository
    .create(input)
    .then(() => {
      logger.debug(
        {
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          durationMs: Date.now() - startTime,
        },
        'Operation logged'
      );
    })
    .catch((error) => {
      logger.warn(
        {
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          error,
        },
        'Failed to log operation'
      );
    });
}

/**
 * Log a failed operation asynchronously (fire-and-forget)
 */
export function logOperationFailure(params: LogOperationParams, errorMessage: string): void {
  const startTime = Date.now();

  const input: CreateOperationLogInput = {
    ...params,
    status: 'failed',
    errorMessage,
    durationMs: params.durationMs ?? null,
  };

  operationLogRepository
    .create(input)
    .then(() => {
      logger.debug(
        {
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          errorMessage,
          durationMs: Date.now() - startTime,
        },
        'Failed operation logged'
      );
    })
    .catch((error) => {
      logger.warn(
        {
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          error,
        },
        'Failed to log operation failure'
      );
    });
}

// Re-export types for convenience
export type { ResourceType, OperationAction };
