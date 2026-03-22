import { vectorConfig } from '@config/env';
import { createLogger } from '@core/logger';
import { getQdrantClient } from './qdrant.client';
import type { VectorPoint, SearchResult } from './vector.types';
import {
  buildDeletedVectorConditions,
  buildMustConditions,
  buildSearchFilter,
  isCollectionNotFoundError,
  mapSearchResults,
} from './vector.repository.helpers';
import type { VectorFilter } from './vector.repository.helpers';

const logger = createLogger('vector.repository');

type SoftDeleteThenPhysicalDeleteInput = {
  collectionName: string;
  filter: VectorFilter;
  timeoutLabel: string;
  successMessage: string;
  failureMessage: string;
  logMeta: Record<string, unknown>;
};

type MustCondition = Record<string, unknown>;
type MustFilter = { must: MustCondition[] };
type DeleteTarget = { filter: MustFilter } | { points: string[] };

async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

function toMustFilter(mustConditions: MustCondition[]): MustFilter {
  return { must: mustConditions };
}

async function setDeletedPayload(
  collectionName: string,
  target: DeleteTarget,
  timeoutLabel: string
): Promise<void> {
  const qdrant = getQdrantClient();
  await withTimeout(
    qdrant.setPayload(collectionName, {
      payload: { isDeleted: true, deletedAtMs: Date.now() },
      wait: true,
      ...target,
    }),
    vectorConfig.mutationTimeoutMs,
    timeoutLabel
  );
}

async function deletePoints(
  collectionName: string,
  target: DeleteTarget,
  timeoutLabel: string,
  timeoutMs = vectorConfig.mutationTimeoutMs
): Promise<void> {
  const qdrant = getQdrantClient();
  await withTimeout(
    qdrant.delete(collectionName, {
      wait: true,
      ...target,
    }),
    timeoutMs,
    timeoutLabel
  );
}

async function countPoints(
  collectionName: string,
  mustConditions: MustCondition[],
  timeoutLabel: string
): Promise<number> {
  const qdrant = getQdrantClient();
  const result = await withTimeout(
    qdrant.count(collectionName, {
      filter: toMustFilter(mustConditions),
      exact: true,
    }),
    vectorConfig.countTimeoutMs,
    timeoutLabel
  );
  return result.count;
}

async function softDeleteThenPhysicalDelete(
  input: SoftDeleteThenPhysicalDeleteInput
): Promise<boolean> {
  const softDeleteSuccess = await vectorRepository.markAsDeleted(
    input.collectionName,
    input.filter
  );

  try {
    await deletePoints(
      input.collectionName,
      { filter: toMustFilter(buildMustConditions(input.filter)) },
      input.timeoutLabel
    );

    logger.debug(input.logMeta, input.successMessage);
  } catch (error) {
    logger.warn({ ...input.logMeta, error, softDeleteSuccess }, input.failureMessage);
  }

  return softDeleteSuccess;
}

export const vectorRepository = {
  /**
   * Upsert vectors to a specific collection
   */
  async upsert(collectionName: string, points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;

    const qdrant = getQdrantClient();

    await withTimeout(
      qdrant.upsert(collectionName, {
        wait: true,
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload as unknown as Record<string, unknown>,
        })),
      }),
      vectorConfig.mutationTimeoutMs,
      `Qdrant upsert to ${collectionName}`
    );

    logger.debug({ collectionName, count: points.length }, 'Upserted vectors');
  },

  /**
   * Search vectors in a specific collection
   */
  async search(
    collectionName: string,
    vector: number[],
    userId: string,
    options?: {
      limit?: number;
      scoreThreshold?: number;
      documentIds?: string[];
      knowledgeBaseId?: string;
    }
  ): Promise<SearchResult[]> {
    const qdrant = getQdrantClient();
    const limit = options?.limit ?? 5;
    const scoreThreshold = options?.scoreThreshold ?? 0.7;

    const results = await withTimeout(
      qdrant.search(collectionName, {
        vector,
        limit,
        score_threshold: scoreThreshold,
        filter: buildSearchFilter(userId, options),
        with_payload: true,
      }),
      vectorConfig.searchTimeoutMs,
      `Qdrant search in ${collectionName}`
    );

    return mapSearchResults(results);
  },

  /**
   * Delete vectors by document ID from a specific collection
   * First marks as deleted (soft delete), then attempts physical deletion.
   * Returns true if soft delete succeeded (vectors won't appear in search).
   */
  async deleteByDocumentId(collectionName: string, documentId: string): Promise<boolean> {
    return softDeleteThenPhysicalDelete({
      collectionName,
      filter: { documentId },
      timeoutLabel: `Qdrant delete by documentId ${documentId}`,
      successMessage: 'Deleted vectors for document',
      failureMessage: 'Physical vector deletion failed, but soft delete may have succeeded',
      logMeta: { collectionName, documentId },
    });
  },

  async deleteByIndexVersionId(collectionName: string, indexVersionId: string): Promise<boolean> {
    return softDeleteThenPhysicalDelete({
      collectionName,
      filter: { indexVersionId },
      timeoutLabel: `Qdrant delete by indexVersionId ${indexVersionId}`,
      successMessage: 'Deleted vectors for index version',
      failureMessage: 'Physical vector deletion failed for index version',
      logMeta: { collectionName, indexVersionId },
    });
  },

  /**
   * Delete all vectors for a knowledge base from a specific collection
   * First marks as deleted (soft delete), then attempts physical deletion.
   * Returns true if soft delete succeeded.
   */
  async deleteByKnowledgeBaseId(collectionName: string, knowledgeBaseId: string): Promise<boolean> {
    return softDeleteThenPhysicalDelete({
      collectionName,
      filter: { knowledgeBaseId },
      timeoutLabel: `Qdrant delete by knowledgeBaseId ${knowledgeBaseId}`,
      successMessage: 'Deleted vectors for knowledge base',
      failureMessage: 'Physical vector deletion failed for knowledge base',
      logMeta: { collectionName, knowledgeBaseId },
    });
  },

  /**
   * Mark vectors as deleted (soft delete) by setting isDeleted: true in payload.
   * This immediately excludes vectors from search results.
   * Returns true if the operation succeeded.
   */
  async markAsDeleted(collectionName: string, filter: VectorFilter): Promise<boolean> {
    const mustConditions = buildMustConditions(filter);

    if (mustConditions.length === 0) {
      logger.warn('markAsDeleted called without filter - skipping');
      return false;
    }

    try {
      await setDeletedPayload(
        collectionName,
        { filter: toMustFilter(mustConditions) },
        `Qdrant markAsDeleted for ${JSON.stringify(filter)}`
      );

      logger.debug({ collectionName, filter }, 'Marked vectors as deleted');
      return true;
    } catch (error) {
      logger.warn({ collectionName, filter, error }, 'Failed to mark vectors as deleted');
      return false;
    }
  },

  /**
   * Physically delete vectors that are marked as deleted (cleanup task).
   * Returns the number of vectors deleted.
   */
  async purgeDeletedVectors(collectionName: string, deletedBeforeMs?: number): Promise<number> {
    const mustConditions = buildDeletedVectorConditions(deletedBeforeMs);

    try {
      const deletedCount = await countPoints(
        collectionName,
        mustConditions,
        `Qdrant count deleted vectors in ${collectionName}`
      );

      if (deletedCount === 0) {
        return 0;
      }

      await deletePoints(
        collectionName,
        { filter: toMustFilter(mustConditions) },
        `Qdrant purge deleted vectors from ${collectionName}`,
        vectorConfig.maintenanceTimeoutMs
      );

      logger.info({ collectionName, count: deletedCount }, 'Purged deleted vectors');
      return deletedCount;
    } catch (error) {
      logger.warn({ collectionName, error }, 'Failed to purge deleted vectors');
      throw error;
    }
  },

  /**
   * Count vectors for a knowledge base in a specific collection
   */
  async countByKnowledgeBaseId(collectionName: string, knowledgeBaseId: string): Promise<number> {
    try {
      return await countPoints(
        collectionName,
        buildMustConditions({ knowledgeBaseId }),
        `Qdrant count by knowledgeBaseId ${knowledgeBaseId}`
      );
    } catch (error) {
      if (isCollectionNotFoundError(error)) {
        logger.info(
          { collectionName, knowledgeBaseId },
          'Vector collection missing while counting knowledge base vectors'
        );
        return 0;
      }

      logger.warn(
        { collectionName, knowledgeBaseId, error },
        'Failed to count vectors for knowledge base'
      );
      throw error;
    }
  },

  /**
   * Delete vectors by their specific IDs from a collection.
   * Used for cleanup of old vectors after new ones are inserted.
   */
  async deleteByIds(collectionName: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    try {
      await setDeletedPayload(
        collectionName,
        { points: ids },
        `Qdrant mark vectors as deleted by IDs`
      );
    } catch (error) {
      logger.warn(
        { collectionName, idCount: ids.length, error },
        'Failed to soft-delete vectors by IDs'
      );
    }

    try {
      await deletePoints(collectionName, { points: ids }, `Qdrant delete by IDs`);

      logger.debug({ collectionName, count: ids.length }, 'Deleted vectors by IDs');
    } catch (error) {
      logger.warn(
        { collectionName, idCount: ids.length, error },
        'Physical vector deletion by IDs failed'
      );
    }
  },
};
