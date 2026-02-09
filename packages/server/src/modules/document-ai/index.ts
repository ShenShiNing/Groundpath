/**
 * Document AI Module
 * Provides document summarization, analysis, and generation capabilities
 */

// Routes
export { default as documentAiRoutes } from './document-ai.routes';

// Services
export { summaryService } from './services/summary.service';
export { analysisService } from './services/analysis.service';
export { generationService } from './services/generation.service';
export { documentAiLlmService } from './services/document-ai-llm.service';
export { documentAiCacheService } from './services/document-ai-cache.service';
export { documentAiSseService } from './services/document-ai-sse.service';

// Controllers
export { summaryController } from './controllers/summary.controller';
export { analysisController } from './controllers/analysis.controller';
export { generationController } from './controllers/generation.controller';

// Prompts
export {
  promptVersions,
  SUMMARY_PROMPT_VERSION,
  ANALYSIS_PROMPT_VERSION,
  GENERATION_PROMPT_VERSION,
} from './prompts';
