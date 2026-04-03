/**
 * Document AI Routes
 * Routes for document summarization, analysis, and generation
 */

import { Router } from 'express';
import { authenticate, aiRateLimiter } from '@core/middleware';
import { validateBody } from '@core/middleware';
import {
  summaryRequestSchema,
  analysisRequestSchema,
  extractKeywordsRequestSchema,
  extractEntitiesRequestSchema,
  generateRequestSchema,
  expandRequestSchema,
} from '@groundpath/shared/schemas';
import { requireDocumentOwnership } from '@modules/document/public/ownership';
import { summaryController } from './controllers/summary.controller';
import { analysisController } from './controllers/analysis.controller';
import { generationController } from './controllers/generation.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================================================
// Summary Routes
// ============================================================================

// POST /api/v1/document-ai/:id/summary - Generate document summary
router.post(
  '/:id/summary',
  aiRateLimiter,
  validateBody(summaryRequestSchema),
  requireDocumentOwnership(),
  summaryController.generate
);

// POST /api/v1/document-ai/:id/summary/stream - Stream document summary (SSE)
router.post(
  '/:id/summary/stream',
  aiRateLimiter,
  validateBody(summaryRequestSchema),
  requireDocumentOwnership(),
  summaryController.stream
);

// ============================================================================
// Analysis Routes
// ============================================================================

// POST /api/v1/document-ai/:id/analyze - Comprehensive analysis
router.post(
  '/:id/analyze',
  aiRateLimiter,
  validateBody(analysisRequestSchema),
  requireDocumentOwnership(),
  analysisController.analyze
);

// POST /api/v1/document-ai/:id/analyze/keywords - Extract keywords only
router.post(
  '/:id/analyze/keywords',
  aiRateLimiter,
  validateBody(extractKeywordsRequestSchema),
  requireDocumentOwnership(),
  analysisController.extractKeywords
);

// POST /api/v1/document-ai/:id/analyze/entities - Extract entities only
router.post(
  '/:id/analyze/entities',
  aiRateLimiter,
  validateBody(extractEntitiesRequestSchema),
  requireDocumentOwnership(),
  analysisController.extractEntities
);

// GET /api/v1/document-ai/:id/analyze/structure - Get document structure (no LLM)
router.get('/:id/analyze/structure', requireDocumentOwnership(), analysisController.getStructure);

// ============================================================================
// Generation Routes
// ============================================================================

// POST /api/v1/document-ai/generate - Generate new content
router.post(
  '/generate',
  aiRateLimiter,
  validateBody(generateRequestSchema),
  generationController.generate
);

// POST /api/v1/document-ai/generate/stream - Stream content generation (SSE)
router.post(
  '/generate/stream',
  aiRateLimiter,
  validateBody(generateRequestSchema),
  generationController.streamGenerate
);

// POST /api/v1/document-ai/:id/expand - Expand existing document
router.post(
  '/:id/expand',
  aiRateLimiter,
  validateBody(expandRequestSchema),
  requireDocumentOwnership(),
  generationController.expand
);

// POST /api/v1/document-ai/:id/expand/stream - Stream document expansion (SSE)
router.post(
  '/:id/expand/stream',
  aiRateLimiter,
  validateBody(expandRequestSchema),
  requireDocumentOwnership(),
  generationController.streamExpand
);

export default router;
