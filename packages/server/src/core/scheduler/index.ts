import cron from 'node-cron';
import {
  backfillScheduleConfig,
  documentConfig,
  loggingConfig,
  featureFlags,
  structuredRagObservabilityConfig,
} from '@core/config/env';
import { createLogger } from '@core/logger';
import { systemLogger } from '@core/logger/system-logger';
import { logCleanupService, structuredRagAlertService } from '@modules/logs/public/maintenance';
import { documentIndexArtifactCleanupService } from '@modules/document-index/public/artifact-cleanup';
import { documentIndexBackfillService } from '@modules/document-index/public/backfill';
import { tokenCleanupService } from '@modules/auth';
import { counterSyncService } from '@modules/knowledge-base/public/counters';
import { vectorCleanupService } from '@modules/vector';
import { processingRecoveryService } from '@modules/rag';

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
  if (loggingConfig.cleanup.enabled) {
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
  if (featureFlags.counterSyncEnabled) {
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

  if (structuredRagObservabilityConfig.alertsEnabled) {
    cron.schedule(
      structuredRagObservabilityConfig.alertScheduleCron,
      async () => {
        logger.info('Running structured RAG alert check...');

        try {
          const result = await structuredRagAlertService.checkAndNotify();
          systemLogger.schedulerRun(
            'structured-rag.alert-check',
            'Structured RAG alert check completed',
            undefined,
            result
          );
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error({ error }, 'Structured RAG alert check failed');
          systemLogger.schedulerError('structured-rag.alert-check.failed', error);
        }
      },
      {
        timezone: 'UTC',
      }
    );
    scheduledTasks.push(
      `structured-rag-alerts (${structuredRagObservabilityConfig.alertScheduleCron} UTC)`
    );
  }

  if (backfillScheduleConfig.enabled) {
    cron.schedule(
      backfillScheduleConfig.cron,
      async () => {
        logger.info('Running document index backfill schedule...');

        try {
          const result = await documentIndexBackfillService.runScheduledBackfill();
          systemLogger.schedulerRun(
            'document-index.backfill',
            'Document index backfill schedule completed',
            undefined,
            result
          );
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error({ error }, 'Document index backfill schedule failed');
          systemLogger.schedulerError('document-index.backfill.failed', error);
        }
      },
      {
        timezone: 'UTC',
      }
    );
    scheduledTasks.push(`document-index-backfill (${backfillScheduleConfig.cron} UTC)`);
  }

  if (documentConfig.processingRecoveryEnabled) {
    cron.schedule(
      documentConfig.processingRecoveryCron,
      async () => {
        logger.info('Running stale document processing recovery...');

        try {
          const result = await processingRecoveryService.recoverStaleProcessing();
          systemLogger.schedulerRun(
            'document-processing.recovery',
            'Stale document processing recovery completed',
            undefined,
            result
          );
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error({ error }, 'Stale document processing recovery failed');
          systemLogger.schedulerError('document-processing.recovery.failed', error);
        }
      },
      {
        timezone: 'UTC',
      }
    );
    scheduledTasks.push(
      `document-processing-recovery (${documentConfig.processingRecoveryCron} UTC, timeout ${documentConfig.processingTimeoutMinutes} min)`
    );
  }

  if (documentConfig.buildCleanupEnabled) {
    cron.schedule(
      documentConfig.buildCleanupCron,
      async () => {
        logger.info('Running immutable document build cleanup...');

        try {
          const result = await documentIndexArtifactCleanupService.cleanup();
          systemLogger.schedulerRun(
            'document-index.artifact-cleanup',
            'Immutable document build cleanup completed',
            undefined,
            result
          );
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error({ error }, 'Immutable document build cleanup failed');
          systemLogger.schedulerError('document-index.artifact-cleanup.failed', error);
        }
      },
      {
        timezone: 'UTC',
      }
    );
    scheduledTasks.push(
      `document-index-artifact-cleanup (${documentConfig.buildCleanupCron} UTC, retention ${documentConfig.buildCleanupRetentionDays} days)`
    );
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

/**
 * Manually trigger stale document processing recovery (for testing/admin purposes)
 */
export async function triggerDocumentProcessingRecovery() {
  logger.info('Manually triggering stale document processing recovery...');
  return processingRecoveryService.recoverStaleProcessing();
}

/**
 * Manually trigger immutable document build cleanup (for testing/admin purposes)
 */
export async function triggerDocumentIndexArtifactCleanup() {
  logger.info('Manually triggering immutable document build cleanup...');
  return documentIndexArtifactCleanupService.cleanup();
}
