import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { documentController } from '../controller/documentController';
import { authenticate } from '../middleware/authMiddleware';
import { validateBody, validateQuery } from '../middleware/validationMiddleware';
import {
  updateDocumentRequestSchema,
  documentListParamsSchema,
  trashListParamsSchema,
} from '@knowledge-agent/shared/schemas';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_DOCUMENT_SIZE ?? '22020096', 10), // 21 MiB default
  },
});

// Multer error handling middleware
function handleMulterError(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxSize = parseInt(process.env.MAX_DOCUMENT_SIZE ?? '22020096', 10);
      const maxMB = Math.round(maxSize / (1024 * 1024));
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

// All routes require authentication
router.use(authenticate);

// ==================== Trash Routes (must be before /:id routes) ====================

// List trash documents
router.get('/trash', validateQuery(trashListParamsSchema), documentController.listTrash);

// Restore document from trash
router.post('/:id/restore', documentController.restore);

// Permanently delete document
router.delete('/:id/permanent', documentController.permanentDelete);

// ==================== Document Routes ====================

// Upload document
router.post('/', uploadWithErrorHandling('file'), documentController.upload);

// List documents
router.get('/', validateQuery(documentListParamsSchema), documentController.list);

// Get document details
router.get('/:id', documentController.getById);

// Update document
router.patch('/:id', validateBody(updateDocumentRequestSchema), documentController.update);

// Delete document
router.delete('/:id', documentController.delete);

// Download document
router.get('/:id/download', documentController.download);

// ==================== Version Routes ====================

// Get version history
router.get('/:id/versions', documentController.getVersionHistory);

// Upload new version
router.post('/:id/versions', uploadWithErrorHandling('file'), documentController.uploadNewVersion);

// Restore to specific version
router.post('/:id/versions/:versionId/restore', documentController.restoreVersion);

export default router;
