import { Router } from 'express';
import { ragSearchRequestSchema } from '@groundpath/shared/schemas';
import { authenticate, aiRateLimiter, getValidatedBody, validateBody } from '@core/middleware';
import { ragController } from './controllers/rag.controller';
import { requireDocumentOwnership } from '@modules/document/public/ownership';
import { requireKnowledgeBaseOwnership } from '@modules/knowledge-base/public/ownership';

const router = Router();

router.use(authenticate);

router.post(
  '/search',
  aiRateLimiter,
  validateBody(ragSearchRequestSchema),
  requireKnowledgeBaseOwnership({
    resolveResourceId: (_req, res) =>
      getValidatedBody<{ knowledgeBaseId: string }>(res).knowledgeBaseId,
  }),
  ragController.search
);
router.post(
  '/process/:documentId',
  aiRateLimiter,
  requireDocumentOwnership(),
  ragController.processDocument
);
router.get('/status/:documentId', requireDocumentOwnership(), ragController.getStatus);

export default router;
