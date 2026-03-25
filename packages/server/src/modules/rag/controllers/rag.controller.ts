import type { Request, Response } from 'express';
import type { Document } from '@core/db/schema/document/documents.schema';
import { ragSearchRequestSchema } from '@groundpath/shared/schemas';
import { sendSuccessResponse, handleError, Errors } from '@core/errors';
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
  async search(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = ragSearchRequestSchema.parse(req.body);

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
    } catch (error) {
      handleError(error, res, 'RAG search');
    }
  },

  async processDocument(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const document = requireOwnedDocument(res);
      const documentId = document.id;

      // Enqueue processing job (non-blocking, deduped by documentId)
      await enqueueDocumentProcessing(documentId, userId, {
        targetDocumentVersion: document.currentVersion,
        reason: 'retry',
      });

      sendSuccessResponse(res, {
        documentId,
        status: 'processing',
        message: 'Document processing started',
      });
    } catch (error) {
      handleError(error, res, 'RAG process');
    }
  },

  async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const document = requireOwnedDocument(res);

      sendSuccessResponse(res, {
        documentId: document.id,
        processingStatus: document.processingStatus,
        processingError: document.processingError,
        chunkCount: document.chunkCount,
      });
    } catch (error) {
      handleError(error, res, 'RAG status');
    }
  },
};
