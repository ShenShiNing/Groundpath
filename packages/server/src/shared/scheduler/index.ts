import cron from 'node-cron';
import { env } from '@shared/config/env';
import { createLogger } from '@shared/logger';
import { systemLogger } from '@shared/logger/system-logger';
import { logCleanupService } from '@modules/logs/services/log-cleanup.service';
import { tokenCleanupService } from '@modules/auth/services/token-cleanup.service';

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

  if (!env.LOG_CLEANUP_ENABLED) {
    logger.info('Cleanup scheduler is disabled');
    return;
  }

  // Schedule cleanup daily at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    logger.info('Running scheduled cleanup tasks...');

    const results = await Promise.allSettled([
      logCleanupService.runCleanup(),
      tokenCleanupService.runCleanup(),
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
  });

  isInitialized = true;
  logger.info('Scheduler initialized - cleanup tasks scheduled at 3:00 AM UTC daily');
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
