import { vlmConfig } from '@config/env';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import type { VLMProvider } from './vlm-provider.interface';
import { OpenAIVLMProvider } from './providers/openai-vlm.provider';
import { AnthropicVLMProvider } from './providers/anthropic-vlm.provider';

const logger = createLogger('vlm.factory');

let cachedProvider: VLMProvider | null = null;

export function getVLMProvider(): VLMProvider {
  if (cachedProvider) return cachedProvider;

  const apiKey = vlmConfig.apiKey;
  if (!apiKey) {
    throw Errors.validation(`VLM API key not configured. Set VLM_API_KEY in your environment.`);
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
