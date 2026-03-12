import { vectorConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import { getQdrantClient } from './qdrant.client';
import type { VectorPoint, SearchResult, ChunkPayload } from './vector.types';

const logger = createLogger('vector.repository');

type VectorFilter = {
  documentId?: string;
  knowledgeBaseId?: string;
  indexVersionId?: string;
};

type SoftDeleteThenPhysicalDeleteInput = {
  collectionName: string;
  filter: VectorFilter;
  timeoutLabel: string;
  successMessage: string;
  failureMessage: string;
  logMeta: Record<string, unknown>;
};

// Helper to add timeout to async operations
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

function buildMustConditions(filter: VectorFilter): Array<Record<string, unknown>> {
  const mustConditions: Array<Record<string, unknown>> = [];

  if (filter.documentId) {
    mustConditions.push({ key: 'documentId', match: { value: filter.documentId } });
  }
  if (filter.knowledgeBaseId) {
    mustConditions.push({ key: 'knowledgeBaseId', match: { value: filter.knowledgeBaseId } });
  }
  if (filter.indexVersionId) {
    mustConditions.push({ key: 'indexVersionId', match: { value: filter.indexVersionId } });
  }

  return mustConditions;
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return '';

  const details = error as Error & {
    data?: { status?: { error?: string } };
    response?: { status?: number };
    status?: number;
    message?: string;
  };

  return details.data?.status?.error ?? details.message ?? '';
}

function getErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;

  const details = error as Error & {
    response?: { status?: number };
    status?: number;
    data?: { status?: { code?: number } };
  };

  return details.response?.status ?? details.status ?? details.data?.status?.code;
}

function isCollectionNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);

  return (
    status === 404 ||
    (message.includes('collection') &&
      (message.includes('not found') || message.includes('does not exist')))
  );
}

async function softDeleteThenPhysicalDelete(
  input: SoftDeleteThenPhysicalDeleteInput
): Promise<boolean> {
  const qdrant = getQdrantClient();
  const softDeleteSuccess = await vectorRepository.markAsDeleted(
    input.collectionName,
    input.filter
  );

  try {
    await withTimeout(
      qdrant.delete(input.collectionName, {
        wait: true,
        filter: {
          must: buildMustConditions(input.filter),
        },
      }),
      vectorConfig.mutationTimeoutMs,
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

    const mustConditions: unknown[] = [{ key: 'userId', match: { value: userId } }];

    // Exclude soft-deleted vectors
    const mustNotConditions: unknown[] = [{ key: 'isDeleted', match: { value: true } }];

    // Filter by knowledge base if specified
    if (options?.knowledgeBaseId) {
      mustConditions.push({
        key: 'knowledgeBaseId',
        match: { value: options.knowledgeBaseId },
      });
    }

    // Filter by document IDs if specified
    if (options?.documentIds && options.documentIds.length > 0) {
      mustConditions.push({
        key: 'documentId',
        match: { any: options.documentIds },
      });
    }

    const filter: Record<string, unknown> = {
      must: mustConditions,
      must_not: mustNotConditions,
    };

    const results = await withTimeout(
      qdrant.search(collectionName, {
        vector,
        limit,
        score_threshold: scoreThreshold,
        filter,
        with_payload: true,
      }),
      vectorConfig.searchTimeoutMs,
      `Qdrant search in ${collectionName}`
    );

    return results.map((r) => {
      const payload = r.payload as unknown as ChunkPayload;
      return {
        id: r.id as string,
        documentId: payload.documentId,
        knowledgeBaseId: payload.knowledgeBaseId,
        content: payload.content,
        score: r.score,
        chunkIndex: payload.chunkIndex,
        documentVersion: payload.version,
        indexVersionId: payload.indexVersionId,
      };
    });
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
    const qdrant = getQdrantClient();
    const mustConditions = buildMustConditions(filter);

    if (mustConditions.length === 0) {
      logger.warn('markAsDeleted called without filter - skipping');
      return false;
    }

    try {
      await withTimeout(
        qdrant.setPayload(collectionName, {
          payload: { isDeleted: true },
          filter: { must: mustConditions },
          wait: true,
        }),
        vectorConfig.mutationTimeoutMs,
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
  async purgeDeletedVectors(collectionName: string): Promise<number> {
    const qdrant = getQdrantClient();

    try {
      // First count how many will be deleted
      const countResult = await withTimeout(
        qdrant.count(collectionName, {
          filter: {
            must: [{ key: 'isDeleted', match: { value: true } }],
          },
          exact: true,
        }),
        vectorConfig.countTimeoutMs,
        `Qdrant count deleted vectors in ${collectionName}`
      );

      if (countResult.count === 0) {
        return 0;
      }

      // Delete them
      await withTimeout(
        qdrant.delete(collectionName, {
          wait: true,
          filter: {
            must: [{ key: 'isDeleted', match: { value: true } }],
          },
        }),
        vectorConfig.maintenanceTimeoutMs,
        `Qdrant purge deleted vectors from ${collectionName}`
      );

      logger.info({ collectionName, count: countResult.count }, 'Purged deleted vectors');
      return countResult.count;
    } catch (error) {
      logger.warn({ collectionName, error }, 'Failed to purge deleted vectors');
      return 0;
    }
  },

  /**
   * Count vectors for a knowledge base in a specific collection
   */
  async countByKnowledgeBaseId(collectionName: string, knowledgeBaseId: string): Promise<number> {
    const qdrant = getQdrantClient();

    try {
      const result = await withTimeout(
        qdrant.count(collectionName, {
          filter: {
            must: [{ key: 'knowledgeBaseId', match: { value: knowledgeBaseId } }],
          },
          exact: true,
        }),
        vectorConfig.countTimeoutMs,
        `Qdrant count by knowledgeBaseId ${knowledgeBaseId}`
      );
      return result.count;
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

    const qdrant = getQdrantClient();

    // First mark as deleted (soft delete for immediate search exclusion)
    try {
      await withTimeout(
        qdrant.setPayload(collectionName, {
          payload: { isDeleted: true },
          points: ids,
          wait: true,
        }),
        vectorConfig.mutationTimeoutMs,
        `Qdrant mark vectors as deleted by IDs`
      );
    } catch (error) {
      logger.warn(
        { collectionName, idCount: ids.length, error },
        'Failed to soft-delete vectors by IDs'
      );
    }

    // Then physically delete
    try {
      await withTimeout(
        qdrant.delete(collectionName, {
          wait: true,
          points: ids,
        }),
        vectorConfig.mutationTimeoutMs,
        `Qdrant delete by IDs`
      );

      logger.debug({ collectionName, count: ids.length }, 'Deleted vectors by IDs');
    } catch (error) {
      logger.warn(
        { collectionName, idCount: ids.length, error },
        'Physical vector deletion by IDs failed'
      );
      // Don't throw - soft delete provides safety net
    }
  },
};
