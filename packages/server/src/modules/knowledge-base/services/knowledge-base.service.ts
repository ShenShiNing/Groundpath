import { v4 as uuidv4 } from 'uuid';
import { KNOWLEDGE_BASE_ERROR_CODES } from '@knowledge-agent/shared';
import type {
  KnowledgeBaseInfo,
  KnowledgeBaseListItem,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  EmbeddingProviderType,
} from '@knowledge-agent/shared/types';
import type { KnowledgeBase } from '@shared/db/schema/document/knowledge-bases.schema';
import type { Transaction } from '@shared/db/db.utils';
import { Errors } from '@shared/errors';
import { knowledgeBaseRepository } from '../repositories/knowledge-base.repository';
import { logOperation } from '@shared/logger/operation-logger';
import { embeddingConfig } from '@config/env';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Embedding configuration for a provider
 */
export interface EmbeddingConfig {
  provider: EmbeddingProviderType;
  model: string;
  dimensions: number;
  collectionName: string;
}

/**
 * Get embedding model and dimensions for a provider from env config
 */
function getEmbeddingConfigForProvider(provider: EmbeddingProviderType): {
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
      // OpenAI models have fixed dimensions
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
      // Ollama models have fixed dimensions
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

function assertProviderConfigured(provider: EmbeddingProviderType): void {
  if (provider === 'openai' && !embeddingConfig.openai.apiKey) {
    throw Errors.validation('OPENAI_API_KEY 未配置，无法使用 OpenAI 嵌入模型');
  }
  if (provider === 'zhipu' && !embeddingConfig.zhipu.apiKey) {
    throw Errors.validation('ZHIPU_API_KEY 未配置，无法使用智谱嵌入模型');
  }
}

/**
 * Generate Qdrant collection name from provider and dimensions
 */
export function getCollectionName(provider: EmbeddingProviderType, dimensions: number): string {
  return `embedding_${provider}_${dimensions}`;
}

/**
 * Convert database knowledge base to API info
 */
function toKnowledgeBaseInfo(kb: KnowledgeBase): KnowledgeBaseInfo {
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

/**
 * Convert database knowledge base to list item
 */
function toKnowledgeBaseListItem(kb: KnowledgeBase): KnowledgeBaseListItem {
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

/**
 * Knowledge base service for business logic
 */
export const knowledgeBaseService = {
  /**
   * Create a new knowledge base
   */
  async create(
    userId: string,
    data: CreateKnowledgeBaseRequest,
    ctx?: RequestContext
  ): Promise<KnowledgeBaseInfo> {
    const startTime = Date.now();

    assertProviderConfigured(data.embeddingProvider);

    // Get embedding config for provider
    const { model, dimensions } = getEmbeddingConfigForProvider(data.embeddingProvider);

    const kbId = uuidv4();
    const kb = await knowledgeBaseRepository.create({
      id: kbId,
      userId,
      name: data.name,
      description: data.description ?? null,
      embeddingProvider: data.embeddingProvider,
      embeddingModel: model,
      embeddingDimensions: dimensions,
      createdBy: userId,
    });

    // Log operation
    logOperation({
      userId,
      resourceType: 'knowledge_base',
      resourceId: kbId,
      resourceName: data.name,
      action: 'knowledge_base.create',
      description: `Created knowledge base: ${data.name}`,
      metadata: {
        embeddingProvider: data.embeddingProvider,
        embeddingModel: model,
        embeddingDimensions: dimensions,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return toKnowledgeBaseInfo(kb);
  },

  /**
   * Get knowledge base by ID (with ownership check)
   */
  async getById(kbId: string, userId: string): Promise<KnowledgeBaseInfo> {
    const kb = await knowledgeBaseRepository.findByIdAndUser(kbId, userId);
    if (!kb) {
      throw Errors.auth(
        KNOWLEDGE_BASE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND as 'KNOWLEDGE_BASE_NOT_FOUND',
        'Knowledge base not found',
        404
      );
    }
    return toKnowledgeBaseInfo(kb);
  },

  /**
   * List all knowledge bases for a user
   */
  async list(userId: string): Promise<KnowledgeBaseListItem[]> {
    const kbs = await knowledgeBaseRepository.listByUser(userId);
    return kbs.map(toKnowledgeBaseListItem);
  },

  /**
   * Update knowledge base (only name and description, embedding config is immutable)
   */
  async update(
    kbId: string,
    userId: string,
    data: UpdateKnowledgeBaseRequest,
    ctx?: RequestContext
  ): Promise<KnowledgeBaseInfo> {
    const startTime = Date.now();

    const kb = await knowledgeBaseRepository.findByIdAndUser(kbId, userId);
    if (!kb) {
      throw Errors.auth(
        KNOWLEDGE_BASE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND as 'KNOWLEDGE_BASE_NOT_FOUND',
        'Knowledge base not found',
        404
      );
    }

    // Capture old values for logging
    const oldValue = {
      name: kb.name,
      description: kb.description,
    };

    const updated = await knowledgeBaseRepository.update(kbId, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      updatedBy: userId,
    });

    // Log operation
    logOperation({
      userId,
      resourceType: 'knowledge_base',
      resourceId: kbId,
      resourceName: updated!.name,
      action: 'knowledge_base.update',
      description: 'Updated knowledge base',
      oldValue,
      newValue: {
        name: data.name ?? kb.name,
        description: data.description ?? kb.description,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return toKnowledgeBaseInfo(updated!);
  },

  /**
   * Delete knowledge base (soft delete)
   * Note: Cascade deletion of documents and vectors should be handled by the caller
   */
  async delete(kbId: string, userId: string, ctx?: RequestContext): Promise<void> {
    const startTime = Date.now();

    const kb = await knowledgeBaseRepository.findByIdAndUser(kbId, userId);
    if (!kb) {
      throw Errors.auth(
        KNOWLEDGE_BASE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND as 'KNOWLEDGE_BASE_NOT_FOUND',
        'Knowledge base not found',
        404
      );
    }

    await knowledgeBaseRepository.softDelete(kbId, userId);

    // Log operation
    logOperation({
      userId,
      resourceType: 'knowledge_base',
      resourceId: kbId,
      resourceName: kb.name,
      action: 'knowledge_base.delete',
      description: `Deleted knowledge base: ${kb.name}`,
      metadata: {
        documentCount: kb.documentCount,
        totalChunks: kb.totalChunks,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
  },

  /**
   * Get embedding configuration for a knowledge base
   */
  async getEmbeddingConfig(kbId: string): Promise<EmbeddingConfig> {
    const kb = await knowledgeBaseRepository.findById(kbId);
    if (!kb) {
      throw Errors.auth(
        KNOWLEDGE_BASE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND as 'KNOWLEDGE_BASE_NOT_FOUND',
        'Knowledge base not found',
        404
      );
    }

    return {
      provider: kb.embeddingProvider as EmbeddingProviderType,
      model: kb.embeddingModel,
      dimensions: kb.embeddingDimensions,
      collectionName: getCollectionName(
        kb.embeddingProvider as EmbeddingProviderType,
        kb.embeddingDimensions
      ),
    };
  },

  /**
   * Validate knowledge base exists and belongs to user
   */
  async validateOwnership(kbId: string, userId: string): Promise<KnowledgeBase> {
    const kb = await knowledgeBaseRepository.findByIdAndUser(kbId, userId);
    if (!kb) {
      throw Errors.auth(
        KNOWLEDGE_BASE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND as 'KNOWLEDGE_BASE_NOT_FOUND',
        'Knowledge base not found or access denied',
        404
      );
    }
    return kb;
  },

  /**
   * Increment document count
   */
  async incrementDocumentCount(kbId: string, delta: number, tx?: Transaction): Promise<void> {
    await knowledgeBaseRepository.incrementDocumentCount(kbId, delta, tx);
  },

  /**
   * Increment total chunks count
   */
  async incrementTotalChunks(kbId: string, delta: number, tx?: Transaction): Promise<void> {
    await knowledgeBaseRepository.incrementTotalChunks(kbId, delta, tx);
  },
};
