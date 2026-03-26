import type { Request, Response } from 'express';
import type { Document } from '@core/db/schema/document/documents.schema';
import type { RagSearchRequest } from '@groundpath/shared/schemas';
import { sendSuccessResponse, Errors, asyncHandler } from '@core/errors';
import { getValidatedBody } from '@core/middleware';
import { searchService } from '../services/search.service';
import { enqueueDocumentProcessing } from '../queue';

function requireOwnedDocument(res: Response): Document {
  const document = res.locals.ownedResources?.document;
  if (!document) {
    throw Errors.internal('Owned document missing from request context');
  }
  return document;
}

export const ragController = {
  search: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const parsed = getValidatedBody<RagSearchRequest>(res);

    const results = await searchService.searchInKnowledgeBase({
      userId,
      knowledgeBaseId: parsed.knowledgeBaseId,
      query: parsed.query,
      limit: parsed.limit,
      scoreThreshold: parsed.scoreThreshold,
      documentIds: parsed.documentIds,
    });

    sendSuccessResponse(res, {
      query: parsed.query,
      knowledgeBaseId: parsed.knowledgeBaseId,
      chunks: results,
    });
  }),

  processDocument: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const document = requireOwnedDocument(res);
    const documentId = document.id;

    await enqueueDocumentProcessing(documentId, userId, {
      targetDocumentVersion: document.currentVersion,
      reason: 'retry',
    });

    sendSuccessResponse(res, {
      documentId,
      status: 'processing',
      message: 'Document processing started',
    });
  }),

  getStatus: asyncHandler(async (_req: Request, res: Response) => {
    const document = requireOwnedDocument(res);

    sendSuccessResponse(res, {
      documentId: document.id,
      processingStatus: document.processingStatus,
      processingError: document.processingError,
      chunkCount: document.chunkCount,
    });
  }),
};
