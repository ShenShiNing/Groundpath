import { v4 as uuidv4 } from 'uuid';
import type {
  KnowledgeBaseInfo,
  KnowledgeBaseListResponse,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KnowledgeBaseListParams,
  EmbeddingProviderType,
} from '@groundpath/shared/types';
import type { KnowledgeBase } from '@core/db/schema/document/knowledge-bases.schema';
import type { Transaction } from '@core/db/db.utils';
import { withTransaction } from '@core/db/db.utils';
import { createLogger } from '@core/logger';
import { documentNodeRepository } from '@modules/document-index/public/repositories';
import {
  documentRepository,
  documentVersionRepository,
} from '@modules/document/public/repositories';
import { documentStorageService } from '@modules/document/public/storage';
import { vectorRepository } from '@modules/vector/public/repositories';
import { knowledgeBaseRepository } from '../repositories/knowledge-base.repository';
import { logOperation } from '@core/logger/operation-logger';
import {
  assertProviderConfigured,
  getCollectionName,
  getEmbeddingConfigForProvider,
  knowledgeBaseNotFoundError,
  toKnowledgeBaseInfo,
  toKnowledgeBaseListItem,
} from './knowledge-base.service.helpers';
import type { EmbeddingConfig, RequestContext } from './knowledge-base.service.helpers';

export type { EmbeddingConfig, RequestContext } from './knowledge-base.service.helpers';
export { getCollectionName } from './knowledge-base.service.helpers';

const logger = createLogger('knowledge-base.service');

function buildOperationContext(startTime: number, ctx?: RequestContext) {
  return {
    ipAddress: ctx?.ipAddress ?? null,
    userAgent: ctx?.userAgent ?? null,
    durationMs: Date.now() - startTime,
  };
}

async function getOwnedKnowledgeBaseOrThrow(
  kbId: string,
  userId: string,
  message = 'Knowledge base not found'
): Promise<KnowledgeBase> {
  const kb = await knowledgeBaseRepository.findByIdAndUser(kbId, userId);
  if (!kb) {
    throw knowledgeBaseNotFoundError(message);
  }
  return kb;
}

async function getKnowledgeBaseOrThrow(kbId: string): Promise<KnowledgeBase> {
  const kb = await knowledgeBaseRepository.findById(kbId);
  if (!kb) {
    throw knowledgeBaseNotFoundError();
  }
  return kb;
}

function uniqueStorageKeys(keys: string[]): string[] {
  return [...new Set(keys)];
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
      ...buildOperationContext(startTime, ctx),
    });

    return toKnowledgeBaseInfo(kb);
  },

  /**
   * Get knowledge base by ID (with ownership check)
   */
  async getById(kbId: string, userId: string): Promise<KnowledgeBaseInfo> {
    return toKnowledgeBaseInfo(await getOwnedKnowledgeBaseOrThrow(kbId, userId));
  },

  /**
   * List all knowledge bases for a user (paginated)
   */
  async list(userId: string, params?: KnowledgeBaseListParams): Promise<KnowledgeBaseListResponse> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;

    const [kbs, total] = await Promise.all([
      knowledgeBaseRepository.listByUser(userId, { page, pageSize }),
      knowledgeBaseRepository.countByUser(userId),
    ]);

    return {
      knowledgeBases: kbs.map(toKnowledgeBaseListItem),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
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

    const kb = await getOwnedKnowledgeBaseOrThrow(kbId, userId);

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
    if (!updated) {
      throw knowledgeBaseNotFoundError();
    }

    // Log operation
    logOperation({
      userId,
      resourceType: 'knowledge_base',
      resourceId: kbId,
      resourceName: updated.name,
      action: 'knowledge_base.update',
      description: 'Updated knowledge base',
      oldValue,
      newValue: {
        name: data.name ?? kb.name,
        description: data.description ?? kb.description,
      },
      ...buildOperationContext(startTime, ctx),
    });

    return toKnowledgeBaseInfo(updated);
  },

  /**
   * Delete knowledge base and cascade cleanup of its documents, index artifacts, and vectors.
   */
  async delete(kbId: string, userId: string, ctx?: RequestContext): Promise<void> {
    const startTime = Date.now();

    const kb = await getOwnedKnowledgeBaseOrThrow(kbId, userId);
    const collectionName = getCollectionName(
      kb.embeddingProvider as EmbeddingProviderType,
      kb.embeddingDimensions
    );

    const deletionSummary = await withTransaction(async (tx) => {
      await knowledgeBaseService.lockOwnership(kbId, userId, tx);

      const documents = await documentRepository.listByKnowledgeBaseId(
        kbId,
        { includeDeleted: true },
        tx
      );
      const documentIds = documents.map((document) => document.id);
      const versions = await documentVersionRepository.listByDocumentIds(documentIds, tx);
      const imageStorageKeys = await documentNodeRepository.listImageStorageKeysByDocumentIds(
        documentIds,
        tx
      );

      await documentRepository.hardDeleteByKnowledgeBaseId(kbId, tx);
      await knowledgeBaseRepository.softDelete(kbId, userId, tx);

      return {
        deletedDocumentCount: documents.length,
        deletedActiveDocumentCount: documents.filter((document) => !document.deletedAt).length,
        deletedChunkTotal: documents.reduce((sum, document) => sum + document.chunkCount, 0),
        deletedVersionCount: versions.length,
        storageKeys: uniqueStorageKeys([
          ...versions.map((version) => version.storageKey),
          ...imageStorageKeys,
        ]),
      };
    });

    for (const storageKey of deletionSummary.storageKeys) {
      try {
        await documentStorageService.deleteDocument(storageKey);
      } catch (err) {
        logger.warn(
          { kbId, storageKey, err },
          'Failed to delete document storage artifact after knowledge base deletion'
        );
      }
    }

    try {
      await vectorRepository.deleteByKnowledgeBaseId(collectionName, kbId);
    } catch (err) {
      logger.warn(
        { kbId, collectionName, err },
        'Failed to delete vectors after knowledge base deletion'
      );
    }

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
        deletedDocumentCount: deletionSummary.deletedDocumentCount,
        deletedActiveDocumentCount: deletionSummary.deletedActiveDocumentCount,
        deletedChunkTotal: deletionSummary.deletedChunkTotal,
        deletedVersionCount: deletionSummary.deletedVersionCount,
        deletedStorageArtifactCount: deletionSummary.storageKeys.length,
      },
      ...buildOperationContext(startTime, ctx),
    });
  },

  /**
   * Get embedding configuration for a knowledge base
   */
  async getEmbeddingConfig(kbId: string): Promise<EmbeddingConfig> {
    const kb = await getKnowledgeBaseOrThrow(kbId);

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
    return getOwnedKnowledgeBaseOrThrow(kbId, userId, 'Knowledge base not found or access denied');
  },

  /**
   * Lock a knowledge base row for update within an existing transaction.
   */
  async lockOwnership(kbId: string, userId: string, tx: Transaction): Promise<void> {
    const locked = await knowledgeBaseRepository.lockByIdAndUser(kbId, userId, tx);
    if (!locked) {
      throw knowledgeBaseNotFoundError('Knowledge base not found or access denied');
    }
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
