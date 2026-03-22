import type { Request, Response } from 'express';
import { ragSearchRequestSchema } from '@groundpath/shared/schemas';
import { sendSuccessResponse, handleError, Errors } from '@core/errors';
import { getParamId } from '@core/utils';
import { searchService } from '../services/search.service';
import { enqueueDocumentProcessing } from '../queue';
import { documentRepository } from '@modules/document/public/repositories';
import { knowledgeBaseService } from '@modules/knowledge-base/public/management';

export const ragController = {
  async search(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = ragSearchRequestSchema.parse(req.body);

      // Validate knowledge base ownership before searching
      await knowledgeBaseService.validateOwnership(parsed.knowledgeBaseId, userId);

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
      const documentId = getParamId(req, 'documentId');

      if (!documentId) {
        throw Errors.validation('Document ID required');
      }

      const document = await documentRepository.findByIdAndUser(documentId, userId);
      if (!document) {
        throw Errors.notFound('Document');
      }

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

  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const documentId = getParamId(req, 'documentId');

      if (!documentId) {
        throw Errors.validation('Document ID required');
      }

      const document = await documentRepository.findByIdAndUser(documentId, userId);
      if (!document) {
        throw Errors.notFound('Document');
      }

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
