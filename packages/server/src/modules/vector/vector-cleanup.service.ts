import { randomUUID } from 'node:crypto';
import { vectorConfig } from '@config/env';
import { buildRedisKey, getRedisClient } from '@core/redis';
import { createLogger } from '@core/logger';
import { getQdrantClient } from './qdrant.client';
import { vectorRepository } from './vector.repository';

const logger = createLogger('vector-cleanup.service');
const CLEANUP_LOCK_KEY = buildRedisKey('vector:cleanup:lock');
const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

export interface VectorCleanupResult {
  collectionsProcessed: number;
  totalPurged: number;
  errors: number;
}

interface CleanupLock {
  key: string;
  token: string;
}

async function acquireCleanupLock(): Promise<CleanupLock | null> {
  const token = randomUUID();
  const result = await getRedisClient().set(
    CLEANUP_LOCK_KEY,
    token,
    'PX',
    vectorConfig.cleanupLockTtlMs,
    'NX'
  );

  if (result !== 'OK') {
    return null;
  }

  return {
    key: CLEANUP_LOCK_KEY,
    token,
  };
}

async function releaseCleanupLock(lock: CleanupLock): Promise<void> {
  await getRedisClient().eval(RELEASE_LOCK_SCRIPT, 1, lock.key, lock.token);
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
    let lock: CleanupLock | null = null;

    try {
      lock = await acquireCleanupLock();
      if (!lock) {
        logger.info('Skipping vector cleanup because another cleanup run already holds the lock');
        return result;
      }

      const qdrant = getQdrantClient();
      const cleanupStartedAt = Date.now();

      // List all collections
      const collectionsResponse = await qdrant.getCollections();
      const collections = collectionsResponse.collections;
      const maxAllowedErrors = collections.length * vectorConfig.cleanupFailureThreshold;

      logger.info({ collectionCount: collections.length }, 'Starting vector cleanup');

      // Process each collection
      for (const collection of collections) {
        try {
          const purged = await vectorRepository.purgeDeletedVectors(
            collection.name,
            cleanupStartedAt
          );
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

          if (result.errors > maxAllowedErrors) {
            const abortError = new Error(
              `Vector cleanup aborted after ${result.errors}/${collections.length} collections failed`
            );
            logger.error(
              {
                errors: result.errors,
                totalCollections: collections.length,
                failureThreshold: vectorConfig.cleanupFailureThreshold,
              },
              'Vector cleanup aborted after exceeding failure threshold'
            );
            throw abortError;
          }
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
    } finally {
      if (lock) {
        try {
          await releaseCleanupLock(lock);
        } catch (error) {
          logger.warn({ error }, 'Failed to release vector cleanup lock');
        }
      }
    }
  },
};
