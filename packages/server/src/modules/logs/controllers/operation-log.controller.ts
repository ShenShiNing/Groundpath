import type { Request, Response } from 'express';
import type {
  OperationLogQueryParams,
  ResourceHistoryParams,
} from '@knowledge-agent/shared/schemas';
import { operationLogService } from '../services/operation-log.service';
import { sendSuccessResponse } from '@core/errors';
import { AppError } from '@core/errors/app-error';
import { asyncHandler } from '@core/errors/async-handler';
import { requireUserId, getParamId } from '@core/utils';
import { getValidatedQuery } from '@core/middleware';
import type { ResourceType } from '@core/db/schema/system/operation-logs.schema';

export const operationLogController = {
  /**
   * GET /api/logs/operations
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const params = getValidatedQuery<OperationLogQueryParams>(res);

    const result = await operationLogService.list(userId, {
      page: params.page,
      pageSize: params.pageSize,
      resourceType: params.resourceType,
      action: params.action,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    sendSuccessResponse(res, result);
  }),

  /**
   * GET /api/logs/operations/resource/:resourceType/:resourceId
   */
  resourceHistory: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const resourceType = getParamId(req, 'resourceType') as ResourceType | undefined;
    const resourceId = getParamId(req, 'resourceId');

    if (
      !resourceType ||
      !['document', 'knowledge_base', 'user', 'session'].includes(resourceType)
    ) {
      throw new AppError('VALIDATION_ERROR', 'Invalid resource type', 400);
    }

    if (!resourceId) {
      throw new AppError('VALIDATION_ERROR', 'Resource ID is required', 400);
    }

    const params = getValidatedQuery<ResourceHistoryParams>(res);

    const logs = await operationLogService.getResourceHistory(
      resourceType as 'document' | 'knowledge_base' | 'user' | 'session',
      resourceId,
      userId,
      params.limit
    );

    sendSuccessResponse(res, { logs });
  }),
};
