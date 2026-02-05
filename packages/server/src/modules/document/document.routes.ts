import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { env } from '@config/env';
import { documentController } from './controllers/document.controller';
import {
  authenticate,
  validateBody,
  validateQuery,
  createSanitizeMiddleware,
} from '@shared/middleware';
import {
  updateDocumentRequestSchema,
  documentListParamsSchema,
  trashListParamsSchema,
} from '@knowledge-agent/shared/schemas';

const router = express.Router();

/**
 * Allowed document MIME types for upload
 * Must stay in sync with document-storage.service.ts ALLOWED_MIME_TYPES
 */
const ALLOWED_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * Allowed extensions (fallback when MIME type is unreliable, e.g. .md files)
 */
const ALLOWED_EXTENSIONS = new Set(['pdf', 'md', 'markdown', 'txt', 'docx']);

/**
 * Extract file extension from filename
 */
function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : '';
}

// Configure multer for memory storage with file filter
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_DOCUMENT_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const ext = getExtension(file.originalname);
    if (ALLOWED_DOCUMENT_MIMES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
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
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      const allowedExts = [...ALLOWED_EXTENSIONS].join(', ');
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: `Invalid file type. Allowed extensions: ${allowedExts}`,
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
// Sanitizes 'title' (default) and 'changeNote' (displayed in version history UI)
const sanitizeMultipartFields = createSanitizeMiddleware(['changeNote']);

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

// Get document content
router.get('/:id/content', documentController.getContent);

// Get document details
router.get('/:id', documentController.getById);

// Update document
router.patch('/:id', validateBody(updateDocumentRequestSchema), documentController.update);

// Delete document
router.delete('/:id', documentController.delete);

// Download document
router.get('/:id/download', documentController.download);
// Preview document (inline)
router.get('/:id/preview', documentController.preview);

// ==================== Version Routes ====================

// Get version history
router.get('/:id/versions', documentController.getVersionHistory);

// Upload new version
router.post('/:id/versions', uploadWithErrorHandling('file'), documentController.uploadNewVersion);

// Restore to specific version
router.post('/:id/versions/:versionId/restore', documentController.restoreVersion);

export default router;
