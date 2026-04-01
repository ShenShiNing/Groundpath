import { Router } from 'express';
import { authenticate, validateBody } from '@core/middleware';
import {
  updateLLMConfigSchema,
  testLLMConnectionSchema,
  fetchModelsSchema,
} from '@groundpath/shared/schemas';
import { llmConfigController } from './controllers/llm-config.controller';

const router = Router();

// All LLM routes require authentication
router.use(authenticate);

// LLM configuration endpoints
router.get('/config', llmConfigController.getConfig);
router.put('/config', validateBody(updateLLMConfigSchema), llmConfigController.updateConfig);
router.delete('/config', llmConfigController.deleteConfig);
router.post(
  '/test-connection',
  validateBody(testLLMConnectionSchema),
  llmConfigController.testConnection
);
router.get('/providers', llmConfigController.getProviders);
router.post('/models', validateBody(fetchModelsSchema), llmConfigController.fetchModels);

export default router;
