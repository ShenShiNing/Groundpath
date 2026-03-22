/**
 * Generation Controller
 * Handles document generation and expansion endpoints
 */

import type { Request, Response } from 'express';
import { generateRequestSchema, expandRequestSchema } from '@groundpath/shared/schemas';
import { generationService } from '../services/generation.service';
import { sendSuccessResponse, handleError } from '@core/errors';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const generationController = {
  /**
   * POST /api/document-ai/generate - Generate new content (non-streaming)
   */
  async generate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = generateRequestSchema.parse(req.body);

      const result = await generationService.generate({
        userId,
        prompt: parsed.prompt,
        template: parsed.template,
        style: parsed.style,
        language: parsed.language,
        maxLength: parsed.maxLength,
        knowledgeBaseId: parsed.knowledgeBaseId,
        contextDocumentIds: parsed.contextDocumentIds,
      });

      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Generate content');
    }
  },

  /**
   * POST /api/document-ai/generate/stream - Stream content generation (SSE)
   */
  async streamGenerate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = generateRequestSchema.parse(req.body);

      // Create abort controller for client disconnect
      const abortController = new AbortController();
      res.on('close', () => abortController.abort());

      await generationService.streamGenerate(res, {
        userId,
        prompt: parsed.prompt,
        template: parsed.template,
        style: parsed.style,
        language: parsed.language,
        maxLength: parsed.maxLength,
        knowledgeBaseId: parsed.knowledgeBaseId,
        contextDocumentIds: parsed.contextDocumentIds,
        signal: abortController.signal,
      });
    } catch (error) {
      if (!res.headersSent) {
        handleError(error, res, 'Stream generate content');
      }
    }
  },

  /**
   * POST /api/document-ai/:id/expand - Expand existing document (non-streaming)
   */
  async expand(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const documentId = paramAsString(req.params.id);
      const parsed = expandRequestSchema.parse(req.body);

      const result = await generationService.expand({
        userId,
        documentId,
        instruction: parsed.instruction,
        position: parsed.position,
        style: parsed.style,
        maxLength: parsed.maxLength,
        knowledgeBaseId: parsed.knowledgeBaseId,
      });

      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Expand document');
    }
  },

  /**
   * POST /api/document-ai/:id/expand/stream - Stream document expansion (SSE)
   */
  async streamExpand(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const documentId = paramAsString(req.params.id);
      const parsed = expandRequestSchema.parse(req.body);

      // Create abort controller for client disconnect
      const abortController = new AbortController();
      res.on('close', () => abortController.abort());

      await generationService.streamExpand(res, {
        userId,
        documentId,
        instruction: parsed.instruction,
        position: parsed.position,
        style: parsed.style,
        maxLength: parsed.maxLength,
        knowledgeBaseId: parsed.knowledgeBaseId,
        signal: abortController.signal,
      });
    } catch (error) {
      if (!res.headersSent) {
        handleError(error, res, 'Stream expand document');
      }
    }
  },
};
