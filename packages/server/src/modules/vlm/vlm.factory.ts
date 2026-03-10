import { vlmConfig, llmConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import type { VLMProvider } from './vlm-provider.interface';
import { OpenAIVLMProvider } from './providers/openai-vlm.provider';
import { AnthropicVLMProvider } from './providers/anthropic-vlm.provider';

const logger = createLogger('vlm.factory');

let cachedProvider: VLMProvider | null = null;

function resolveApiKey(): string | undefined {
  if (vlmConfig.apiKey) return vlmConfig.apiKey;

  switch (vlmConfig.provider) {
    case 'openai':
      return llmConfig.openaiApiKey;
    case 'anthropic':
      return llmConfig.anthropicApiKey;
  }
}

export function getVLMProvider(): VLMProvider {
  if (cachedProvider) return cachedProvider;

  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      `VLM API key not configured. Set VLM_API_KEY or the corresponding LLM provider key for "${vlmConfig.provider}".`
    );
  }

  switch (vlmConfig.provider) {
    case 'openai':
      cachedProvider = new OpenAIVLMProvider(apiKey, vlmConfig.model, vlmConfig.baseUrl);
      break;
    case 'anthropic':
      cachedProvider = new AnthropicVLMProvider(apiKey, vlmConfig.model, vlmConfig.baseUrl);
      break;
  }

  logger.info({ provider: vlmConfig.provider, model: vlmConfig.model }, 'VLM provider initialized');

  return cachedProvider;
}

/** Reset cached provider (useful for testing) */
export function resetVLMProvider(): void {
  cachedProvider = null;
}
