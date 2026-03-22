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
  knowledgeBaseDocumentListParamsSchema,
  knowledgeBaseListParamsSchema,
} from '@groundpath/shared/schemas';

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
  knowledgeBaseController.uploadDocument
);

// List documents in knowledge base
router.get(
  '/:id/documents',
  validateQuery(knowledgeBaseDocumentListParamsSchema),
  knowledgeBaseController.listDocuments
);

export default router;
