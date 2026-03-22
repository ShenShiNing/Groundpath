import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { documentConfig } from '@config/env';
import { knowledgeBaseController } from './controllers/knowledge-base.controller';
import {
  authenticate,
  generalRateLimiter,
  validateBody,
  validateQuery,
  createSanitizeMiddleware,
} from '@core/middleware';
import {
  createKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
  documentListParamsSchema,
  knowledgeBaseListParamsSchema,
} from '@groundpath/shared/schemas';
import { documentService } from '@modules/document/public/management';
import { sendSuccessResponse } from '@core/errors';
import { AppError } from '@core/errors/app-error';
import { asyncHandler } from '@core/errors/async-handler';
import { requireUserId, getParamId, getClientIp } from '@core/utils';
import { getValidatedQuery } from '@core/middleware';
import { HTTP_STATUS } from '@groundpath/shared';
import type { DocumentListParams } from '@groundpath/shared/types';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: documentConfig.maxSize,
  },
});

// Multer error handling middleware
function handleMulterError(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxMB = Math.round(documentConfig.maxSize / (1024 * 1024));
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

// Sanitize middleware for multipart form fields (runs after multer populates req.body)
const sanitizeMultipartFields = createSanitizeMiddleware();

// Helper to wrap upload middleware with error handling and sanitization
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
    sanitizeMultipartFields,
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

// List knowledge bases (paginated)
router.get('/', validateQuery(knowledgeBaseListParamsSchema), knowledgeBaseController.list);

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
  generalRateLimiter,
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

    const { title, description } = req.body as {
      title?: string;
      description?: string;
    };

    const document = await documentService.upload(
      userId,
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: decodeFilename(file.originalname),
        size: file.size,
      },
      { title, description, knowledgeBaseId: kbId },
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

export default router;
