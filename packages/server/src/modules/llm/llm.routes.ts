import { Router } from 'express';
import { authenticate } from '@shared/middleware';
import { llmConfigController } from './controllers/llm-config.controller';

const router = Router();

// All LLM routes require authentication
router.use(authenticate);

// LLM configuration endpoints
router.get('/config', llmConfigController.getConfig);
router.put('/config', llmConfigController.updateConfig);
router.post('/test-connection', llmConfigController.testConnection);
router.get('/providers', llmConfigController.getProviders);
router.post('/models', llmConfigController.fetchModels);

export default router;
