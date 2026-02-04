import cron from 'node-cron';
import { env } from '@shared/config/env';
import { createLogger } from '@shared/logger';
import { systemLogger } from '@shared/logger/system-logger';
import { logCleanupService } from '@modules/logs';
import { tokenCleanupService } from '@modules/auth';
import { counterSyncService } from '@modules/knowledge-base';
import { vectorCleanupService } from '@modules/vector';

const logger = createLogger('scheduler');

let isInitialized = false;

/**
 * Initialize scheduled tasks
 */
export function initializeScheduler(): void {
  if (isInitialized) {
    logger.warn('Scheduler already initialized');
    return;
  }

  const scheduledTasks: string[] = [];

  // Schedule cleanup daily at 3:00 AM UTC (controlled by LOG_CLEANUP_ENABLED)
  if (env.LOG_CLEANUP_ENABLED) {
    cron.schedule(
      '0 3 * * *',
      async () => {
        logger.info('Running scheduled cleanup tasks...');

        const results = await Promise.allSettled([
          logCleanupService.runCleanup(),
          tokenCleanupService.runCleanup(),
          vectorCleanupService.runCleanup(),
        ]);

        for (const result of results) {
          if (result.status === 'rejected') {
            const err =
              result.reason instanceof Error ? result.reason : new Error(String(result.reason));
            logger.error({ error: err }, 'Scheduled cleanup task failed');
            systemLogger.schedulerError('cleanup.failed', err);
          }
        }

        logger.info('Scheduled cleanup tasks finished');
      },
      {
        timezone: 'UTC',
      }
    );
    scheduledTasks.push('cleanup (3:00 AM UTC daily, includes vector purge)');
  }

  // Optional: Schedule counter sync weekly on Sunday at 4:00 AM UTC
  if (env.COUNTER_SYNC_ENABLED) {
    cron.schedule(
      '0 4 * * 0',
      async () => {
        logger.info('Running scheduled counter sync...');

        try {
          const result = await counterSyncService.syncAll();
          logger.info(
            { total: result.total, synced: result.synced, errors: result.errors },
            'Counter sync completed'
          );
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error({ error }, 'Counter sync failed');
          systemLogger.schedulerError('counter-sync.failed', error);
        }
      },
      {
        timezone: 'UTC',
      }
    );
    scheduledTasks.push('counter-sync (4:00 AM UTC every Sunday)');
  }

  isInitialized = true;

  if (scheduledTasks.length > 0) {
    logger.info({ tasks: scheduledTasks }, 'Scheduler initialized');
  } else {
    logger.info('Scheduler initialized - no tasks enabled');
  }
}

/**
 * Manually trigger log cleanup (for testing/admin purposes)
 */
export async function triggerLogCleanup() {
  logger.info('Manually triggering log cleanup...');
  return logCleanupService.runCleanup();
}

/**
 * Manually trigger token cleanup (for testing/admin purposes)
 */
export async function triggerTokenCleanup() {
  logger.info('Manually triggering token cleanup...');
  return tokenCleanupService.runCleanup();
}

/**
 * Manually trigger vector cleanup (for testing/admin purposes)
 */
export async function triggerVectorCleanup() {
  logger.info('Manually triggering vector cleanup...');
  return vectorCleanupService.runCleanup();
}
