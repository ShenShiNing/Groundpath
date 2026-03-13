import type { Request, Response } from 'express';
import type { StructuredRagDashboardQueryParams } from '@knowledge-agent/shared/schemas';
import { sendSuccessResponse } from '@core/errors';
import { asyncHandler } from '@core/errors/async-handler';
import { getValidatedQuery } from '@core/middleware';
import { requireUserId } from '@core/utils';
import { structuredRagDashboardService } from '../services/structured-rag-dashboard.service';

export const structuredRagDashboardController = {
  summary: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const params = getValidatedQuery<StructuredRagDashboardQueryParams>(res);

    const result = await structuredRagDashboardService.getSummary({
      userId,
      hours: params.hours,
      recentLimit: params.recentLimit,
      knowledgeBaseId: params.knowledgeBaseId,
    });

    sendSuccessResponse(res, result);
  }),
};
