/**
 * Summary Controller
 * Handles document summarization endpoints
 */

import type { Request, Response } from 'express';
import { summaryRequestSchema } from '@groundpath/shared/schemas';
import { summaryService } from '../services/summary.service';
import { sendSuccessResponse, handleError } from '@core/errors';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const summaryController = {
  /**
   * POST /api/document-ai/:id/summary - Generate document summary (non-streaming)
   */
  async generate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const documentId = paramAsString(req.params.id);
      const parsed = summaryRequestSchema.parse(req.body);

      const result = await summaryService.generateSummary({
        userId,
        documentId,
        length: parsed.length,
        language: parsed.language,
        focusAreas: parsed.focusAreas,
      });

      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Generate summary');
    }
  },

  /**
   * POST /api/document-ai/:id/summary/stream - Stream document summary (SSE)
   */
  async stream(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const documentId = paramAsString(req.params.id);
      const parsed = summaryRequestSchema.parse(req.body);

      // Create abort controller for client disconnect
      const abortController = new AbortController();
      res.on('close', () => abortController.abort());

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
  },
};
