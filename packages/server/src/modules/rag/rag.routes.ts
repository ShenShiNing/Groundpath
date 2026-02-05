import { Router } from 'express';
import { authenticate } from '@shared/middleware';
import { ragController } from './controllers/rag.controller';

const router = Router();

router.use(authenticate);

router.post('/search', ragController.search);
router.post('/process/:documentId', ragController.processDocument);
router.get('/status/:documentId', ragController.getStatus);

export default router;
