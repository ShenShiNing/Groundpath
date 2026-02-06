import { getQdrantClient } from './qdrant.client';
import { createLogger } from '@shared/logger';
import type { VectorPoint, SearchResult, ChunkPayload } from './vector.types';

const logger = createLogger('vector.repository');

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

const QDRANT_TIMEOUT = 30_000; // 30 seconds

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
      QDRANT_TIMEOUT,
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
      QDRANT_TIMEOUT,
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
      };
    });
  },

  /**
   * Delete vectors by document ID from a specific collection
   * First marks as deleted (soft delete), then attempts physical deletion.
   * Returns true if soft delete succeeded (vectors won't appear in search).
   */
  async deleteByDocumentId(collectionName: string, documentId: string): Promise<boolean> {
    const qdrant = getQdrantClient();

    // Step 1: Soft delete - mark vectors as deleted (critical for search exclusion)
    const softDeleteSuccess = await this.markAsDeleted(collectionName, { documentId });

    // Step 2: Physical delete - attempt to remove vectors entirely
    try {
      await withTimeout(
        qdrant.delete(collectionName, {
          wait: true,
          filter: {
            must: [{ key: 'documentId', match: { value: documentId } }],
          },
        }),
        QDRANT_TIMEOUT,
        `Qdrant delete by documentId ${documentId}`
      );

      logger.debug({ collectionName, documentId }, 'Deleted vectors for document');
    } catch (error) {
      logger.warn(
        { collectionName, documentId, error, softDeleteSuccess },
        'Physical vector deletion failed, but soft delete may have succeeded'
      );
      // Don't throw - soft delete provides safety net
    }

    return softDeleteSuccess;
  },

  /**
   * Delete all vectors for a knowledge base from a specific collection
   * First marks as deleted (soft delete), then attempts physical deletion.
   * Returns true if soft delete succeeded.
   */
  async deleteByKnowledgeBaseId(collectionName: string, knowledgeBaseId: string): Promise<boolean> {
    const qdrant = getQdrantClient();

    // Step 1: Soft delete
    const softDeleteSuccess = await this.markAsDeleted(collectionName, { knowledgeBaseId });

    // Step 2: Physical delete
    try {
      await withTimeout(
        qdrant.delete(collectionName, {
          wait: true,
          filter: {
            must: [{ key: 'knowledgeBaseId', match: { value: knowledgeBaseId } }],
          },
        }),
        QDRANT_TIMEOUT,
        `Qdrant delete by knowledgeBaseId ${knowledgeBaseId}`
      );

      logger.debug({ collectionName, knowledgeBaseId }, 'Deleted vectors for knowledge base');
    } catch (error) {
      logger.warn(
        { collectionName, knowledgeBaseId, error, softDeleteSuccess },
        'Physical vector deletion failed for knowledge base'
      );
    }

    return softDeleteSuccess;
  },

  /**
   * Mark vectors as deleted (soft delete) by setting isDeleted: true in payload.
   * This immediately excludes vectors from search results.
   * Returns true if the operation succeeded.
   */
  async markAsDeleted(
    collectionName: string,
    filter: { documentId?: string; knowledgeBaseId?: string }
  ): Promise<boolean> {
    const qdrant = getQdrantClient();

    const mustConditions: unknown[] = [];
    if (filter.documentId) {
      mustConditions.push({ key: 'documentId', match: { value: filter.documentId } });
    }
    if (filter.knowledgeBaseId) {
      mustConditions.push({ key: 'knowledgeBaseId', match: { value: filter.knowledgeBaseId } });
    }

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
        QDRANT_TIMEOUT,
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
      const countResult = await qdrant.count(collectionName, {
        filter: {
          must: [{ key: 'isDeleted', match: { value: true } }],
        },
        exact: true,
      });

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
        QDRANT_TIMEOUT,
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
      const result = await qdrant.count(collectionName, {
        filter: {
          must: [{ key: 'knowledgeBaseId', match: { value: knowledgeBaseId } }],
        },
        exact: true,
      });
      return result.count;
    } catch {
      return 0;
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
        QDRANT_TIMEOUT,
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
        QDRANT_TIMEOUT,
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
