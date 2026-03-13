import type { EmbeddingProvider, EmbeddingProviderType } from './embedding.types';
import { ZhipuProvider } from './providers/zhipu.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { embeddingConfig } from '@config/env';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';

const logger = createLogger('embedding.factory');

// Cache providers by type
const providers = new Map<EmbeddingProviderType, EmbeddingProvider>();

function createProvider(type: EmbeddingProviderType): EmbeddingProvider {
  switch (type) {
    case 'zhipu':
      return new ZhipuProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'ollama':
      return new OllamaProvider();
    default:
      throw Errors.validation(`Unknown embedding provider: ${type}`);
  }
}

/**
 * Get embedding provider by type (cached)
 */
export function getEmbeddingProviderByType(type: EmbeddingProviderType): EmbeddingProvider {
  if (!providers.has(type)) {
    logger.info({ provider: type }, 'Creating embedding provider');
    providers.set(type, createProvider(type));
  }
  return providers.get(type)!;
}

/**
 * Get the default embedding provider (from env config)
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  return getEmbeddingProviderByType(embeddingConfig.provider);
}

export function resetEmbeddingProvider(): void {
  providers.clear();
}
