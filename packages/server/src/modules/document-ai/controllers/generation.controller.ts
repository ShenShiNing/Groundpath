/**
 * Generation Controller
 * Handles document generation and expansion endpoints
 */

import type { Request, Response } from 'express';
import type { GenerateRequestParsed, ExpandRequestParsed } from '@groundpath/shared/schemas';
import { generationService } from '../services/generation.service';
import { sendSuccessResponse, handleError, asyncHandler } from '@core/errors';
import { getValidatedBody } from '@core/middleware';
import { requireUserId } from '@core/utils';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const generationController = {
  /**
   * POST /api/document-ai/generate - Generate new content (non-streaming)
   */
  generate: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = getValidatedBody<GenerateRequestParsed>(res);

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
  }),

  /**
   * POST /api/document-ai/generate/stream - Stream content generation (SSE)
   */
  streamGenerate: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = getValidatedBody<GenerateRequestParsed>(res);

    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    try {
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
  }),

  /**
   * POST /api/document-ai/:id/expand - Expand existing document (non-streaming)
   */
  expand: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = paramAsString(req.params.id);
    const parsed = getValidatedBody<ExpandRequestParsed>(res);

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
  }),

  /**
   * POST /api/document-ai/:id/expand/stream - Stream document expansion (SSE)
   */
  streamExpand: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = paramAsString(req.params.id);
    const parsed = getValidatedBody<ExpandRequestParsed>(res);

    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    try {
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
  }),
};
