import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type {
  UpdateDocumentRequest,
  DocumentListParams,
  TrashListParams,
} from '@knowledge-agent/shared/types';
import { documentService } from '../services/document.service';
import { handleError, sendErrorResponse, sendSuccessResponse } from '@shared/errors/errors';
import { getValidatedQuery } from '@shared/middleware/validationMiddleware';

/**
 * Extract authenticated user ID from request, or send 401 response.
 */
function requireUserId(req: Request, res: Response): string | null {
  const userId = req.user?.sub;
  if (!userId) {
    sendErrorResponse(res, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED', 'User not authenticated');
    return null;
  }
  return userId;
}

/**
 * Get string param from request params (handles Express 5 string | string[] type)
 */
function getParamId(req: Request, paramName: string): string | undefined {
  const value = req.params[paramName];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Document controller handlers
 */
/**
 * Decode filename from latin1 to UTF-8 (multer encodes non-ASCII filenames as latin1)
 */
function decodeFilename(filename: string): string {
  try {
    return Buffer.from(filename, 'latin1').toString('utf-8');
  } catch {
    return filename;
  }
}

export const documentController = {
  /**
   * POST /api/documents
   * Upload a new document
   */
  async upload(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const file = req.file;
      if (!file) {
        sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', 'No file uploaded');
        return;
      }

      const { title, description, folderId } = req.body as {
        title?: string;
        description?: string;
        folderId?: string;
      };

      const document = await documentService.upload(
        userId,
        {
          buffer: file.buffer,
          mimetype: file.mimetype,
          originalname: decodeFilename(file.originalname),
          size: file.size,
        },
        { title, description, folderId }
      );

      sendSuccessResponse(
        res,
        { document, message: 'Document uploaded successfully' },
        HTTP_STATUS.CREATED
      );
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  /**
   * GET /api/documents
   * List documents with pagination and filtering
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const params = getValidatedQuery<DocumentListParams>(res);

      const result = await documentService.list(userId, params);
      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  /**
   * GET /api/documents/:id
   * Get document details
   */
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const documentId = getParamId(req, 'id');
      if (!documentId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Document ID is required'
        );
        return;
      }

      const document = await documentService.getById(documentId, userId);
      sendSuccessResponse(res, document);
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  /**
   * PATCH /api/documents/:id
   * Update document metadata
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const documentId = getParamId(req, 'id');
      if (!documentId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Document ID is required'
        );
        return;
      }

      const data = req.body as UpdateDocumentRequest;
      const document = await documentService.update(documentId, userId, data);
      sendSuccessResponse(res, document);
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  /**
   * DELETE /api/documents/:id
   * Delete document (soft delete)
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const documentId = getParamId(req, 'id');
      if (!documentId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Document ID is required'
        );
        return;
      }

      await documentService.delete(documentId, userId);
      sendSuccessResponse(res, { message: 'Document deleted successfully' });
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  /**
   * GET /api/documents/:id/download
   * Stream document for download
   */
  async download(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const documentId = getParamId(req, 'id');
      if (!documentId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Document ID is required'
        );
        return;
      }

      const { body, fileName, contentType, contentLength } =
        await documentService.getDownloadStream(documentId, userId);

      // Set download headers
      const encodedFileName = encodeURIComponent(fileName);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
      );
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      // Stream the file to response
      for await (const chunk of body) {
        res.write(chunk);
      }
      res.end();
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  // ==================== Trash Operations ====================

  /**
   * GET /api/documents/trash
   * List deleted documents
   */
  async listTrash(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const params = getValidatedQuery<TrashListParams>(res);
      const result = await documentService.listTrash(userId, params);
      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  /**
   * POST /api/documents/:id/restore
   * Restore a deleted document
   */
  async restore(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const documentId = getParamId(req, 'id');
      if (!documentId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Document ID is required'
        );
        return;
      }

      const document = await documentService.restore(documentId, userId);
      sendSuccessResponse(res, { document, message: 'Document restored successfully' });
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  /**
   * DELETE /api/documents/:id/permanent
   * Permanently delete a document
   */
  async permanentDelete(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const documentId = getParamId(req, 'id');
      if (!documentId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Document ID is required'
        );
        return;
      }

      await documentService.permanentDelete(documentId, userId);
      sendSuccessResponse(res, { message: 'Document permanently deleted' });
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  // ==================== Version Operations ====================

  /**
   * POST /api/documents/:id/versions
   * Upload a new version of a document
   */
  async uploadNewVersion(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const documentId = getParamId(req, 'id');
      if (!documentId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Document ID is required'
        );
        return;
      }

      const file = req.file;
      if (!file) {
        sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', 'No file uploaded');
        return;
      }

      const { changeNote } = req.body as { changeNote?: string };

      const document = await documentService.uploadNewVersion(
        documentId,
        userId,
        {
          buffer: file.buffer,
          mimetype: file.mimetype,
          originalname: decodeFilename(file.originalname),
          size: file.size,
        },
        { changeNote }
      );

      sendSuccessResponse(
        res,
        { document, message: 'New version uploaded successfully' },
        HTTP_STATUS.CREATED
      );
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  /**
   * GET /api/documents/:id/versions
   * Get version history for a document
   */
  async getVersionHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const documentId = getParamId(req, 'id');
      if (!documentId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Document ID is required'
        );
        return;
      }

      const result = await documentService.getVersionHistory(documentId, userId);
      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },

  /**
   * POST /api/documents/:id/versions/:versionId/restore
   * Restore document to a specific version
   */
  async restoreVersion(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const documentId = getParamId(req, 'id');
      const versionId = getParamId(req, 'versionId');

      if (!documentId || !versionId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Document ID and Version ID are required'
        );
        return;
      }

      const document = await documentService.restoreVersion(documentId, versionId, userId);
      sendSuccessResponse(res, { document, message: 'Version restored successfully' });
    } catch (error) {
      handleError(error, res, 'Document controller');
    }
  },
};
