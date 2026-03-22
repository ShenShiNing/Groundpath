import { KNOWLEDGE_BASE_ERROR_CODES } from '@groundpath/shared';
import type {
  KnowledgeBaseInfo,
  KnowledgeBaseListItem,
  EmbeddingProviderType,
} from '@groundpath/shared/types';
import type { KnowledgeBase } from '@core/db/schema/document/knowledge-bases.schema';
import { Errors } from '@core/errors';
import { embeddingConfig } from '@config/env';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface EmbeddingConfig {
  provider: EmbeddingProviderType;
  model: string;
  dimensions: number;
  collectionName: string;
}

export function getEmbeddingConfigForProvider(provider: EmbeddingProviderType): {
  model: string;
  dimensions: number;
} {
  switch (provider) {
    case 'zhipu':
      return {
        model: embeddingConfig.zhipu.model,
        dimensions: embeddingConfig.zhipu.dimensions,
      };
    case 'openai': {
      const model = embeddingConfig.openai.model;
      const dimensionsMap: Record<string, number> = {
        'text-embedding-3-small': 1536,
        'text-embedding-3-large': 3072,
        'text-embedding-ada-002': 1536,
      };
      return {
        model,
        dimensions: dimensionsMap[model] ?? 1536,
      };
    }
    case 'ollama': {
      const model = embeddingConfig.ollama.model;
      const dimensionsMap: Record<string, number> = {
        'nomic-embed-text': 768,
        'mxbai-embed-large': 1024,
        'all-minilm': 384,
      };
      return {
        model,
        dimensions: dimensionsMap[model] ?? 768,
      };
    }
    default:
      throw Errors.auth(
        KNOWLEDGE_BASE_ERROR_CODES.INVALID_EMBEDDING_PROVIDER as 'INVALID_EMBEDDING_PROVIDER',
        `Invalid embedding provider: ${provider}`,
        400
      );
  }
}

export function assertProviderConfigured(provider: EmbeddingProviderType): void {
  if (provider === 'openai' && !embeddingConfig.openai.apiKey) {
    throw Errors.validation('OPENAI_API_KEY 未配置，无法使用 OpenAI 嵌入模型');
  }
  if (provider === 'zhipu' && !embeddingConfig.zhipu.apiKey) {
    throw Errors.validation('ZHIPU_API_KEY 未配置，无法使用智谱嵌入模型');
  }
}

export function getCollectionName(provider: EmbeddingProviderType, dimensions: number): string {
  return `embedding_${provider}_${dimensions}`;
}

export function toKnowledgeBaseInfo(kb: KnowledgeBase): KnowledgeBaseInfo {
  return {
    id: kb.id,
    userId: kb.userId,
    name: kb.name,
    description: kb.description,
    embeddingProvider: kb.embeddingProvider as EmbeddingProviderType,
    embeddingModel: kb.embeddingModel,
    embeddingDimensions: kb.embeddingDimensions,
    documentCount: kb.documentCount,
    totalChunks: kb.totalChunks,
    createdAt: kb.createdAt,
    updatedAt: kb.updatedAt,
  };
}

export function toKnowledgeBaseListItem(kb: KnowledgeBase): KnowledgeBaseListItem {
  return {
    id: kb.id,
    name: kb.name,
    description: kb.description,
    embeddingProvider: kb.embeddingProvider as EmbeddingProviderType,
    embeddingModel: kb.embeddingModel,
    embeddingDimensions: kb.embeddingDimensions,
    documentCount: kb.documentCount,
    totalChunks: kb.totalChunks,
    createdAt: kb.createdAt,
    updatedAt: kb.updatedAt,
  };
}

export function knowledgeBaseNotFoundError(message = 'Knowledge base not found'): Error {
  return Errors.auth(
    KNOWLEDGE_BASE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND as 'KNOWLEDGE_BASE_NOT_FOUND',
    message,
    404
  );
}
