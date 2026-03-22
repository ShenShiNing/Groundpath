import type { Request, Response } from 'express';
import type { StructuredRagReportQueryParams } from '@groundpath/shared/schemas';
import { asyncHandler } from '@core/errors/async-handler';
import { sendSuccessResponse } from '@core/errors';
import { getValidatedQuery } from '@core/middleware';
import { requireUserId } from '@core/utils';
import { structuredRagReportService } from '../services/structured-rag-report.service';

export const structuredRagReportController = {
  report: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const params = getValidatedQuery<StructuredRagReportQueryParams>(res);

    const result = await structuredRagReportService.generateReport({
      userId,
      days: params.days,
      knowledgeBaseId: params.knowledgeBaseId,
    });

    sendSuccessResponse(res, result);
  }),
};
