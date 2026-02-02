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
    };

    const results = await qdrant.search(collectionName, {
      vector,
      limit,
      score_threshold: scoreThreshold,
      filter,
      with_payload: true,
    });

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
   */
  async deleteByDocumentId(collectionName: string, documentId: string): Promise<void> {
    const qdrant = getQdrantClient();

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
      logger.warn({ collectionName, documentId, error }, 'Failed to delete vectors for document');
      // Don't throw - allow processing to continue even if vector deletion fails
    }
  },

  /**
   * Delete all vectors for a knowledge base from a specific collection
   */
  async deleteByKnowledgeBaseId(collectionName: string, knowledgeBaseId: string): Promise<void> {
    const qdrant = getQdrantClient();

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
        { collectionName, knowledgeBaseId, error },
        'Failed to delete vectors for knowledge base'
      );
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
};
