/**
 * Analysis Controller
 * Handles document analysis endpoints
 */

import type { Request, Response } from 'express';
import type {
  AnalysisRequestParsed,
  ExtractKeywordsRequestParsed,
  ExtractEntitiesRequestParsed,
} from '@groundpath/shared/schemas';
import { analysisService } from '../services/analysis.service';
import { sendSuccessResponse, asyncHandler } from '@core/errors';
import { getValidatedBody } from '@core/middleware';
import { requireUserId } from '@core/utils';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const analysisController = {
  /**
   * POST /api/document-ai/:id/analyze - Perform comprehensive analysis
   */
  analyze: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = paramAsString(req.params.id);
    const parsed = getValidatedBody<AnalysisRequestParsed>(res);

    const result = await analysisService.analyze({
      userId,
      documentId,
      analysisTypes: parsed.analysisTypes,
      maxKeywords: parsed.maxKeywords,
      maxEntities: parsed.maxEntities,
      maxTopics: parsed.maxTopics,
    });

    sendSuccessResponse(res, result);
  }),

  /**
   * POST /api/document-ai/:id/analyze/keywords - Extract keywords only
   */
  extractKeywords: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = paramAsString(req.params.id);
    const { maxKeywords, language } = getValidatedBody<ExtractKeywordsRequestParsed>(res);

    const result = await analysisService.extractKeywords(userId, documentId, {
      maxKeywords,
      language,
    });

    sendSuccessResponse(res, result);
  }),

  /**
   * POST /api/document-ai/:id/analyze/entities - Extract entities only
   */
  extractEntities: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = paramAsString(req.params.id);
    const { maxEntities, language } = getValidatedBody<ExtractEntitiesRequestParsed>(res);

    const result = await analysisService.extractEntities(userId, documentId, {
      maxEntities,
      language,
    });

    sendSuccessResponse(res, result);
  }),

  /**
   * GET /api/document-ai/:id/analyze/structure - Get document structure (no LLM)
   */
  getStructure: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = paramAsString(req.params.id);

    const result = await analysisService.getStructure(userId, documentId);

    sendSuccessResponse(res, result);
  }),
};
