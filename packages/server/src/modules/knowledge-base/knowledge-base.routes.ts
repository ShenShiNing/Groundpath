import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { env } from '@config/env';
import { knowledgeBaseController } from './controllers/knowledge-base.controller';
import { authenticate } from '@shared/middleware/auth.middleware';
import { validateBody, validateQuery } from '@shared/middleware/validation.middleware';
import {
  createKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
  createFolderRequestSchema,
  documentListParamsSchema,
} from '@knowledge-agent/shared/schemas';
import { documentService, folderService } from '@modules/document';
import { sendSuccessResponse } from '@shared/errors/errors';
import { AppError } from '@shared/errors/app-error';
import { asyncHandler } from '@shared/errors/async-handler';
import { requireUserId, getParamId, getClientIp } from '@shared/utils/request.utils';
import { getValidatedQuery } from '@shared/middleware/validation.middleware';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type { DocumentListParams, CreateFolderRequest } from '@knowledge-agent/shared/types';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_DOCUMENT_SIZE,
  },
});

// Multer error handling middleware
function handleMulterError(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxMB = Math.round(env.MAX_DOCUMENT_SIZE / (1024 * 1024));
      res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `File too large. Maximum size is ${maxMB}MB`,
        },
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message,
      },
    });
    return;
  }
  next(err);
}

// Helper to wrap upload middleware with error handling
function uploadWithErrorHandling(fieldName: string) {
  return [
    (req: Request, res: Response, next: NextFunction) => {
      upload.single(fieldName)(req, res, (err: unknown) => {
        if (err) {
          handleMulterError(err as Error, req, res, next);
        } else {
          next();
        }
      });
    },
  ];
}

/**
 * Decode filename from latin1 to UTF-8
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
 * Simple UUID validation
 */
function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// All routes require authentication
router.use(authenticate);

// ==================== Knowledge Base CRUD Routes ====================

// Create knowledge base
router.post('/', validateBody(createKnowledgeBaseSchema), knowledgeBaseController.create);

// List knowledge bases
router.get('/', knowledgeBaseController.list);

// Get knowledge base details
router.get('/:id', knowledgeBaseController.getById);

// Update knowledge base
router.patch('/:id', validateBody(updateKnowledgeBaseSchema), knowledgeBaseController.update);

// Delete knowledge base
router.delete('/:id', knowledgeBaseController.delete);

// ==================== Document Routes (under knowledge base) ====================

// Upload document to knowledge base
router.post(
  '/:id/documents',
  ...uploadWithErrorHandling('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = getParamId(req, 'id');

    if (!kbId || !isValidUuid(kbId)) {
      throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
    }

    const file = req.file;
    if (!file) {
      throw new AppError('VALIDATION_ERROR', 'No file uploaded', 400);
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
      { title, description, folderId, knowledgeBaseId: kbId },
      getRequestContext(req)
    );

    sendSuccessResponse(
      res,
      { document, message: 'Document uploaded successfully' },
      HTTP_STATUS.CREATED
    );
  })
);

// List documents in knowledge base
router.get(
  '/:id/documents',
  validateQuery(documentListParamsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = getParamId(req, 'id');

    if (!kbId || !isValidUuid(kbId)) {
      throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
    }

    const params = getValidatedQuery<DocumentListParams>(res);

    const result = await documentService.list(userId, { ...params, knowledgeBaseId: kbId });
    sendSuccessResponse(res, result);
  })
);

// ==================== Folder Routes (under knowledge base) ====================

// List folders in knowledge base
router.get(
  '/:id/folders',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = getParamId(req, 'id');

    if (!kbId || !isValidUuid(kbId)) {
      throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
    }

    const folders = await folderService.listByKnowledgeBase(kbId, userId);
    sendSuccessResponse(res, folders);
  })
);

// Get folder tree for knowledge base
router.get(
  '/:id/folders/tree',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = getParamId(req, 'id');

    if (!kbId || !isValidUuid(kbId)) {
      throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
    }

    const tree = await folderService.getTreeByKnowledgeBase(kbId, userId);
    sendSuccessResponse(res, tree);
  })
);

// Create folder in knowledge base
router.post(
  '/:id/folders',
  validateBody(createFolderRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = getParamId(req, 'id');

    if (!kbId || !isValidUuid(kbId)) {
      throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
    }

    const data = req.body as CreateFolderRequest;
    // Override knowledgeBaseId with the one from URL
    const folder = await folderService.create(
      userId,
      { ...data, knowledgeBaseId: kbId },
      getRequestContext(req)
    );

    sendSuccessResponse(res, folder, HTTP_STATUS.CREATED);
  })
);

export default router;
