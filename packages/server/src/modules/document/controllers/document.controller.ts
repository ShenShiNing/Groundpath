import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type {
  UpdateDocumentRequest,
  DocumentListParams,
  TrashListParams,
  SaveDocumentContentRequest,
} from '@knowledge-agent/shared/types';
import { documentService } from '../services/document.service';
import { sendSuccessResponse } from '@shared/errors';
import { AppError } from '@shared/errors/app-error';
import { asyncHandler } from '@shared/errors/async-handler';
import { requireUserId, getParamId, getClientIp } from '@shared/utils';
import { getValidatedQuery } from '@shared/middleware';
import { createLogger } from '@shared/logger';

const logger = createLogger('document.controller');

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

/**
 * Extract request context for logging
 */
function getRequestContext(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] ?? null,
  };
}

/**
 * Stream file download to response (shared logic for download and preview)
 */
async function streamDownload(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const documentId = getParamId(req, 'id');
  if (!documentId) {
    throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
  }

  const { body, fileName, contentType, contentLength } = await documentService.getDownloadStream(
    documentId,
    userId,
    getRequestContext(req)
  );

  // Set download headers
  const encodedFileName = encodeURIComponent(fileName);
  const isInline = req.query.inline === '1';
  const dispositionType = isInline ? 'inline' : 'attachment';
  res.setHeader(
    'Content-Disposition',
    `${dispositionType}; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
  );
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  // Convert async iterable to Node.js Readable stream
  const sourceStream = Readable.from(body);

  // Track if client disconnected
  let clientDisconnected = false;
  const onClose = () => {
    clientDisconnected = true;
    sourceStream.destroy();
  };
  res.on('close', onClose);

  try {
    // Use pipeline for proper backpressure handling and cleanup
    await pipeline(sourceStream, res);
  } catch (err) {
    // Ignore errors from client disconnect (expected behavior)
    if (!clientDisconnected && !res.writableEnded) {
      logger.warn({ err, documentId }, 'Stream error during file download');
      // Don't throw - response may be partially sent
    }
  } finally {
    res.off('close', onClose);
  }
}

export const documentController = {
  /**
   * POST /api/documents
   */
  upload: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);

    const file = req.file;
    if (!file) {
      throw new AppError('VALIDATION_ERROR', 'No file uploaded', 400);
    }

    const { title, description, folderId, knowledgeBaseId } = req.body as {
      title?: string;
      description?: string;
      folderId?: string;
      knowledgeBaseId?: string;
    };

    if (!knowledgeBaseId) {
      throw new AppError('VALIDATION_ERROR', 'Knowledge base ID is required', 400);
    }

    const document = await documentService.upload(
      userId,
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: decodeFilename(file.originalname),
        size: file.size,
      },
      { title, description, folderId, knowledgeBaseId },
      getRequestContext(req)
    );

    sendSuccessResponse(
      res,
      { document, message: 'Document uploaded successfully' },
      HTTP_STATUS.CREATED
    );
  }),

  /**
   * GET /api/documents
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const params = getValidatedQuery<DocumentListParams>(res);

    const result = await documentService.list(userId, params);
    sendSuccessResponse(res, result);
  }),

  /**
   * GET /api/documents/:id
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    if (!documentId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
    }

    const document = await documentService.getById(documentId, userId);
    sendSuccessResponse(res, document);
  }),

  /**
   * GET /api/documents/:id/content
   */
  getContent: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    if (!documentId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
    }

    const content = await documentService.getContent(documentId, userId);
    sendSuccessResponse(res, content);
  }),

  /**
   * PUT /api/documents/:id/content
   */
  saveContent: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    if (!documentId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
    }

    const data = req.body as SaveDocumentContentRequest;
    const document = await documentService.saveContent(
      documentId,
      userId,
      data,
      getRequestContext(req)
    );
    sendSuccessResponse(res, { document, message: 'Document content saved successfully' });
  }),

  /**
   * PATCH /api/documents/:id
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    if (!documentId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
    }

    const data = req.body as UpdateDocumentRequest;
    const document = await documentService.update(documentId, userId, data, getRequestContext(req));
    sendSuccessResponse(res, document);
  }),

  /**
   * DELETE /api/documents/:id
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    if (!documentId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
    }

    await documentService.delete(documentId, userId, getRequestContext(req));
    sendSuccessResponse(res, { message: 'Document deleted successfully' });
  }),

  /**
   * GET /api/documents/:id/download
   */
  download: asyncHandler(async (req: Request, res: Response) => {
    await streamDownload(req, res);
  }),

  /**
   * GET /api/documents/:id/preview (always inline)
   */
  preview: asyncHandler(async (req: Request, res: Response) => {
    req.query.inline = '1';
    await streamDownload(req, res);
  }),

  // ==================== Trash Operations ====================

  /**
   * GET /api/documents/trash
   */
  listTrash: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const params = getValidatedQuery<TrashListParams>(res);
    const result = await documentService.listTrash(userId, params);
    sendSuccessResponse(res, result);
  }),

  /**
   * POST /api/documents/:id/restore
   */
  restore: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    if (!documentId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
    }

    const document = await documentService.restore(documentId, userId, getRequestContext(req));
    sendSuccessResponse(res, { document, message: 'Document restored successfully' });
  }),

  /**
   * DELETE /api/documents/:id/permanent
   */
  permanentDelete: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    if (!documentId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
    }

    await documentService.permanentDelete(documentId, userId, getRequestContext(req));
    sendSuccessResponse(res, { message: 'Document permanently deleted' });
  }),

  // ==================== Version Operations ====================

  /**
   * POST /api/documents/:id/versions
   */
  uploadNewVersion: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    if (!documentId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
    }

    const file = req.file;
    if (!file) {
      throw new AppError('VALIDATION_ERROR', 'No file uploaded', 400);
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
      { changeNote },
      getRequestContext(req)
    );

    sendSuccessResponse(
      res,
      { document, message: 'New version uploaded successfully' },
      HTTP_STATUS.CREATED
    );
  }),

  /**
   * GET /api/documents/:id/versions
   */
  getVersionHistory: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    if (!documentId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID is required', 400);
    }

    const result = await documentService.getVersionHistory(documentId, userId);
    sendSuccessResponse(res, result);
  }),

  /**
   * POST /api/documents/:id/versions/:versionId/restore
   */
  restoreVersion: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = getParamId(req, 'id');
    const versionId = getParamId(req, 'versionId');

    if (!documentId || !versionId) {
      throw new AppError('VALIDATION_ERROR', 'Document ID and Version ID are required', 400);
    }

    const document = await documentService.restoreVersion(
      documentId,
      versionId,
      userId,
      getRequestContext(req)
    );
    sendSuccessResponse(res, { document, message: 'Version restored successfully' });
  }),
};
