/**
 * Document AI Routes
 * Routes for document summarization, analysis, and generation
 */

import { Router } from 'express';
import { authenticate } from '@shared/middleware';
import { validateBody } from '@shared/middleware';
import {
  summaryRequestSchema,
  analysisRequestSchema,
  generateRequestSchema,
  expandRequestSchema,
} from '@knowledge-agent/shared/schemas';
import { summaryController } from './controllers/summary.controller';
import { analysisController } from './controllers/analysis.controller';
import { generationController } from './controllers/generation.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================================================
// Summary Routes
// ============================================================================

// POST /api/document-ai/:id/summary - Generate document summary
router.post('/:id/summary', validateBody(summaryRequestSchema), summaryController.generate);

// POST /api/document-ai/:id/summary/stream - Stream document summary (SSE)
router.post('/:id/summary/stream', validateBody(summaryRequestSchema), summaryController.stream);

// ============================================================================
// Analysis Routes
// ============================================================================

// POST /api/document-ai/:id/analyze - Comprehensive analysis
router.post('/:id/analyze', validateBody(analysisRequestSchema), analysisController.analyze);

// POST /api/document-ai/:id/analyze/keywords - Extract keywords only
router.post('/:id/analyze/keywords', analysisController.extractKeywords);

// POST /api/document-ai/:id/analyze/entities - Extract entities only
router.post('/:id/analyze/entities', analysisController.extractEntities);

// GET /api/document-ai/:id/analyze/structure - Get document structure (no LLM)
router.get('/:id/analyze/structure', analysisController.getStructure);

// ============================================================================
// Generation Routes
// ============================================================================

// POST /api/document-ai/generate - Generate new content
router.post('/generate', validateBody(generateRequestSchema), generationController.generate);

// POST /api/document-ai/generate/stream - Stream content generation (SSE)
router.post(
  '/generate/stream',
  validateBody(generateRequestSchema),
  generationController.streamGenerate
);

// POST /api/document-ai/:id/expand - Expand existing document
router.post('/:id/expand', validateBody(expandRequestSchema), generationController.expand);

// POST /api/document-ai/:id/expand/stream - Stream document expansion (SSE)
router.post(
  '/:id/expand/stream',
  validateBody(expandRequestSchema),
  generationController.streamExpand
);

export default router;
