import type { Request, Response } from 'express';
import type { StructuredRagReportQueryParams } from '@knowledge-agent/shared/schemas';
import { asyncHandler } from '@shared/errors/async-handler';
import { sendSuccessResponse } from '@shared/errors';
import { getValidatedQuery } from '@shared/middleware';
import { requireUserId } from '@shared/utils';
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
