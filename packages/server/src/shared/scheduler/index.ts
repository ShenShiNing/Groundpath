import cron from 'node-cron';
import { env } from '@shared/config/env';
import { createLogger } from '@shared/logger';
import { systemLogger } from '@shared/logger/system-logger';
import { logCleanupService } from '@modules/logs/services/log-cleanup.service';

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
    logger.info('Log cleanup scheduler is disabled');
    return;
  }

  // Schedule log cleanup daily at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    logger.info('Running scheduled log cleanup...');
    try {
      const result = await logCleanupService.runCleanup();
      logger.info(result, 'Scheduled log cleanup completed successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ error: err }, 'Scheduled log cleanup failed');
      systemLogger.schedulerError('log.cleanup.failed', err);
    }
  });

  isInitialized = true;
  logger.info('Scheduler initialized - log cleanup scheduled at 3:00 AM UTC daily');
}

/**
 * Manually trigger log cleanup (for testing/admin purposes)
 */
export async function triggerLogCleanup() {
  logger.info('Manually triggering log cleanup...');
  return logCleanupService.runCleanup();
}
