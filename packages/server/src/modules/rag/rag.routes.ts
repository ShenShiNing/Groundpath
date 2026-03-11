import { Router } from 'express';
import { authenticate, aiRateLimiter } from '@shared/middleware';
import { ragController } from './controllers/rag.controller';

const router = Router();

router.use(authenticate);

router.post('/search', aiRateLimiter, ragController.search);
router.post('/process/:documentId', aiRateLimiter, ragController.processDocument);
router.get('/status/:documentId', ragController.getStatus);

export default router;
