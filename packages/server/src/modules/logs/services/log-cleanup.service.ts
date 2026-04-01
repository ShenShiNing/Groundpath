import { loggingConfig } from '@core/config/env';
import { createLogger } from '@core/logger';
import { systemLogger } from '@core/logger/system-logger';
import { loginLogRepository } from '@modules/auth/public/login-logs';
import { operationLogRepository } from '../repositories/operation-log.repository';
import { systemLogRepository } from '../repositories/system-log.repository';
import {
  createEmptyLogPartitionMaintenanceResult,
  logPartitionService,
} from './log-partition.service';

const logger = createLogger('log-cleanup.service');

export interface CleanupResult {
  loginLogsDeleted: number;
  operationLogsDeleted: number;
  systemLogsDeleted: number;
  loginLogFuturePartitionsAdded: number;
  loginLogExpiredPartitionsDropped: number;
  operationLogFuturePartitionsAdded: number;
  operationLogExpiredPartitionsDropped: number;
  durationMs: number;
}

/**
 * Calculate cutoff date from retention days
 */
function getCutoffDate(retentionDays: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return cutoff;
}

/**
 * Delete logs in batches until none remain
 */
async function deleteInBatches(
  deleteOlderThan: (date: Date, batchSize: number) => Promise<number>,
  cutoffDate: Date,
  batchSize: number
): Promise<number> {
  let totalDeleted = 0;
  let deleted: number;

  do {
    deleted = await deleteOlderThan(cutoffDate, batchSize);
    totalDeleted += deleted;
  } while (deleted === batchSize);

  return totalDeleted;
}

export const logCleanupService = {
  /**
   * Run log cleanup for all log types
   */
  async runCleanup(): Promise<CleanupResult> {
    const startTime = Date.now();
    const batchSize = loggingConfig.cleanup.batchSize;

    logger.info('Starting log cleanup...');

    // Calculate cutoff dates
    const loginCutoff = getCutoffDate(loggingConfig.retention.loginDays);
    const operationCutoff = getCutoffDate(loggingConfig.retention.operationDays);
    const systemCutoff = getCutoffDate(loggingConfig.retention.systemDays);
    let partitionMaintenance = createEmptyLogPartitionMaintenanceResult();

    try {
      partitionMaintenance = await logPartitionService.maintainPartitions({
        loginCutoff,
        operationCutoff,
      });
    } catch (error) {
      logger.warn(
        { error },
        'Log partition maintenance failed; continuing with row-based cleanup'
      );
    }

    // Delete old logs in batches
    const [loginLogsDeleted, operationLogsDeleted, systemLogsDeleted] = await Promise.all([
      deleteInBatches(
        (date, size) => loginLogRepository.deleteOlderThan(date, size),
        loginCutoff,
        batchSize
      ),
      deleteInBatches(
        (date, size) => operationLogRepository.deleteOlderThan(date, size),
        operationCutoff,
        batchSize
      ),
      deleteInBatches(
        (date, size) => systemLogRepository.deleteOlderThan(date, size),
        systemCutoff,
        batchSize
      ),
    ]);

    const durationMs = Date.now() - startTime;

    const result: CleanupResult = {
      loginLogsDeleted,
      operationLogsDeleted,
      systemLogsDeleted,
      loginLogFuturePartitionsAdded: partitionMaintenance.loginLogs.futurePartitionsAdded,
      loginLogExpiredPartitionsDropped: partitionMaintenance.loginLogs.expiredPartitionsDropped,
      operationLogFuturePartitionsAdded:
        partitionMaintenance.operationLogs.futurePartitionsAdded,
      operationLogExpiredPartitionsDropped:
        partitionMaintenance.operationLogs.expiredPartitionsDropped,
      durationMs,
    };

    logger.info(result, 'Log cleanup completed');

    // Log the cleanup event to system logs
    systemLogger.schedulerRun('log.cleanup', 'Scheduled log cleanup completed', durationMs, {
      loginLogsDeleted,
      operationLogsDeleted,
      systemLogsDeleted,
      partitionMaintenance,
      retentionDays: {
        login: loggingConfig.retention.loginDays,
        operation: loggingConfig.retention.operationDays,
        system: loggingConfig.retention.systemDays,
      },
    });

    return result;
  },
};
