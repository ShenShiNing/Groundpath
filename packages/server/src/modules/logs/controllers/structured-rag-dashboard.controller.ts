import type { Request, Response } from 'express';
import type { StructuredRagDashboardQueryParams } from '@knowledge-agent/shared/schemas';
import { sendSuccessResponse } from '@shared/errors';
import { asyncHandler } from '@shared/errors/async-handler';
import { getValidatedQuery } from '@shared/middleware';
import { requireUserId } from '@shared/utils';
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
