/**
 * Summary Controller
 * Handles document summarization endpoints
 */

import type { Request, Response } from 'express';
import type { SummaryRequestParsed } from '@groundpath/shared/schemas';
import { summaryService } from '../services/summary.service';
import { sendSuccessResponse, handleError, asyncHandler } from '@core/errors';
import { getValidatedBody } from '@core/middleware';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const summaryController = {
  /**
   * POST /api/document-ai/:id/summary - Generate document summary (non-streaming)
   */
  generate: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const documentId = paramAsString(req.params.id);
    const parsed = getValidatedBody<SummaryRequestParsed>(res);

    const result = await summaryService.generateSummary({
      userId,
      documentId,
      length: parsed.length,
      language: parsed.language,
      focusAreas: parsed.focusAreas,
    });

    sendSuccessResponse(res, result);
  }),

  /**
   * POST /api/document-ai/:id/summary/stream - Stream document summary (SSE)
   */
  stream: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const documentId = paramAsString(req.params.id);
    const parsed = getValidatedBody<SummaryRequestParsed>(res);

    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    try {
      await summaryService.streamSummary(res, {
        userId,
        documentId,
        length: parsed.length,
        language: parsed.language,
        focusAreas: parsed.focusAreas,
        signal: abortController.signal,
      });
    } catch (error) {
      if (!res.headersSent) {
        handleError(error, res, 'Stream summary');
      }
    }
  }),
};
