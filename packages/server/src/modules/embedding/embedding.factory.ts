import type { EmbeddingProvider, EmbeddingProviderType } from './embedding.types';
import { ZhipuProvider } from './providers/zhipu.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { env } from '@config/env';
import { createLogger } from '@shared/logger';

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
      throw new Error(`Unknown embedding provider: ${type}`);
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
  return getEmbeddingProviderByType(env.EMBEDDING_PROVIDER);
}

export function resetEmbeddingProvider(): void {
  providers.clear();
}
