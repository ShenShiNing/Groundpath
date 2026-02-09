/**
 * Document AI Prompts Registry
 * Central registry for all prompt templates with version tracking
 */

// Version numbers - increment when prompts change significantly
export const SUMMARY_PROMPT_VERSION = '1.0.0';
export const ANALYSIS_PROMPT_VERSION = '1.0.0';
export const GENERATION_PROMPT_VERSION = '1.0.0';

// Summary prompts
export {
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
  buildChunkSummaryPrompt,
  buildMergeSummariesPrompt,
  buildMergeUserPrompt,
} from './summary.prompts';

// Analysis prompts
export {
  buildKeywordExtractionPrompt,
  buildEntityExtractionPrompt,
  buildTopicIdentificationPrompt,
  buildAnalysisUserPrompt,
} from './analysis.prompts';

// Generation prompts
export {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  buildExpandSystemPrompt,
  buildExpandUserPrompt,
} from './generation.prompts';

// Prompt versions map (useful for caching)
export const promptVersions = {
  summary: SUMMARY_PROMPT_VERSION,
  analysis: ANALYSIS_PROMPT_VERSION,
  generation: GENERATION_PROMPT_VERSION,
} as const;

export type PromptCategory = keyof typeof promptVersions;
