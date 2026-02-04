import { createLogger } from '@shared/logger';
import { getQdrantClient } from './qdrant.client';
import { vectorRepository } from './vector.repository';

const logger = createLogger('vector-cleanup.service');

export interface VectorCleanupResult {
  collectionsProcessed: number;
  totalPurged: number;
  errors: number;
}

export const vectorCleanupService = {
  /**
   * Purge all vectors marked as deleted (isDeleted: true) from all collections.
   * This should be run periodically to clean up vectors that were soft-deleted
   * but failed to be physically deleted.
   */
  async runCleanup(): Promise<VectorCleanupResult> {
    const startTime = Date.now();
    const result: VectorCleanupResult = {
      collectionsProcessed: 0,
      totalPurged: 0,
      errors: 0,
    };

    try {
      const qdrant = getQdrantClient();

      // List all collections
      const collectionsResponse = await qdrant.getCollections();
      const collections = collectionsResponse.collections;

      logger.info({ collectionCount: collections.length }, 'Starting vector cleanup');

      // Process each collection
      for (const collection of collections) {
        try {
          const purged = await vectorRepository.purgeDeletedVectors(collection.name);
          result.collectionsProcessed++;
          result.totalPurged += purged;

          if (purged > 0) {
            logger.info({ collection: collection.name, purged }, 'Purged deleted vectors');
          }
        } catch (err) {
          result.errors++;
          logger.warn(
            { collection: collection.name, error: err },
            'Failed to purge deleted vectors from collection'
          );
        }
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          durationMs,
          collectionsProcessed: result.collectionsProcessed,
          totalPurged: result.totalPurged,
          errors: result.errors,
        },
        'Vector cleanup completed'
      );

      return result;
    } catch (err) {
      logger.error({ error: err }, 'Vector cleanup failed');
      throw err;
    }
  },
};
