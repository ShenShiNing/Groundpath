/**
 * Analysis Controller
 * Handles document analysis endpoints
 */

import type { Request, Response } from 'express';
import { analysisRequestSchema } from '@knowledge-agent/shared/schemas';
import { analysisService } from '../services/analysis.service';
import { sendSuccessResponse, handleError } from '@shared/errors';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const analysisController = {
  /**
   * POST /api/document-ai/:id/analyze - Perform comprehensive analysis
   */
  async analyze(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const documentId = paramAsString(req.params.id);
      const parsed = analysisRequestSchema.parse(req.body);

      const result = await analysisService.analyze({
        userId,
        documentId,
        analysisTypes: parsed.analysisTypes,
        maxKeywords: parsed.maxKeywords,
        maxEntities: parsed.maxEntities,
        maxTopics: parsed.maxTopics,
      });

      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Analyze document');
    }
  },

  /**
   * POST /api/document-ai/:id/analyze/keywords - Extract keywords only
   */
  async extractKeywords(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const documentId = paramAsString(req.params.id);
      const maxKeywords = req.body.maxKeywords as number | undefined;
      const language = req.body.language as string | undefined;

      const result = await analysisService.extractKeywords(userId, documentId, {
        maxKeywords,
        language,
      });

      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Extract keywords');
    }
  },

  /**
   * POST /api/document-ai/:id/analyze/entities - Extract entities only
   */
  async extractEntities(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const documentId = paramAsString(req.params.id);
      const maxEntities = req.body.maxEntities as number | undefined;
      const language = req.body.language as string | undefined;

      const result = await analysisService.extractEntities(userId, documentId, {
        maxEntities,
        language,
      });

      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Extract entities');
    }
  },

  /**
   * GET /api/document-ai/:id/analyze/structure - Get document structure (no LLM)
   */
  async getStructure(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const documentId = paramAsString(req.params.id);

      const result = await analysisService.getStructure(userId, documentId);

      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Get document structure');
    }
  },
};
