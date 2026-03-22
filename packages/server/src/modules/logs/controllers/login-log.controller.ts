import type { Request, Response } from 'express';
import type { LoginLogQueryParams } from '@groundpath/shared/schemas';
import { loginLogService } from '../services/login-log.service';
import { sendSuccessResponse } from '@core/errors';
import { asyncHandler } from '@core/errors/async-handler';
import { requireUserId } from '@core/utils';
import { getValidatedQuery } from '@core/middleware';

export const loginLogController = {
  /**
   * GET /api/logs/login
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const params = getValidatedQuery<LoginLogQueryParams>(res);

    const result = await loginLogService.list(userId, {
      page: params.page,
      pageSize: params.pageSize,
      success: params.success,
      authType: params.authType,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    sendSuccessResponse(res, result);
  }),

  /**
   * GET /api/logs/login/recent
   */
  recent: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const limitParam = req.query.limit;
    const limit =
      typeof limitParam === 'string'
        ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 50)
        : 10;

    const logs = await loginLogService.getRecent(userId, limit);
    sendSuccessResponse(res, { logs });
  }),
};
