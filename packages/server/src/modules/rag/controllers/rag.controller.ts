import type { Request, Response } from 'express';
import { z } from '@knowledge-agent/shared/schemas';
import { DOCUMENT_ERROR_CODES } from '@knowledge-agent/shared';
import { sendSuccessResponse, handleError, Errors } from '@shared/errors';
import { getParamId } from '@shared/utils/request.utils';
import { searchService } from '../services/search.service';
import { processingService } from '../services/processing.service';
import { documentRepository } from '@modules/document/repositories/document.repository';

const searchSchema = z.object({
  query: z.string().min(1).max(1000),
  knowledgeBaseId: z.string().uuid(),
  limit: z.coerce.number().min(1).max(50).default(5),
  scoreThreshold: z.coerce.number().min(0).max(1).optional(),
  documentIds: z.array(z.string()).optional(),
});

export const ragController = {
  async search(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = searchSchema.parse(req.body);

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
        throw Errors.auth(
          DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
          'Document ID required',
          400
        );
      }

      const document = await documentRepository.findByIdAndUser(documentId, userId);
      if (!document) {
        throw Errors.auth(
          DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
          'Document not found',
          404
        );
      }

      // Trigger async processing
      processingService.processDocument(documentId, userId);

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
        throw Errors.auth(
          DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
          'Document ID required',
          400
        );
      }

      const document = await documentRepository.findByIdAndUser(documentId, userId);
      if (!document) {
        throw Errors.auth(
          DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
          'Document not found',
          404
        );
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
