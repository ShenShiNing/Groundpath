import { loggingConfig } from '@core/config/env';
import { runExclusiveTask } from '@core/coordination';
import { createLogger } from '@core/logger';
import { systemLogger } from '@core/logger/system-logger';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';

const logger = createLogger('token-cleanup.service');
const TOKEN_CLEANUP_LOCK_KEY = 'auth:token-cleanup:lock';

export interface TokenCleanupResult {
  refreshTokensDeleted: number;
  durationMs: number;
}

export const tokenCleanupService = {
  /**
   * Delete revoked and expired refresh tokens in batches
   */
  async runCleanup(): Promise<TokenCleanupResult> {
    const startTime = Date.now();
    const batchSize = loggingConfig.cleanup.batchSize;

    logger.info('Starting token cleanup...');

    let refreshTokensDeleted = 0;
    let deleted: number;

    do {
      deleted = await refreshTokenRepository.deleteInvalid(batchSize);
      refreshTokensDeleted += deleted;
    } while (deleted === batchSize);

    const durationMs = Date.now() - startTime;

    const result: TokenCleanupResult = {
      refreshTokensDeleted,
      durationMs,
    };

    logger.info(result, 'Token cleanup completed');

    systemLogger.schedulerRun('token.cleanup', 'Scheduled token cleanup completed', durationMs, {
      refreshTokensDeleted,
    });

    return result;
  },

  async runScheduledCleanup(): Promise<TokenCleanupResult> {
    return runExclusiveTask(() => this.runCleanup(), {
      key: TOKEN_CLEANUP_LOCK_KEY,
      logger,
      lockBusyMessage: 'Skipping token cleanup because another instance already holds the lock',
      lockLostMessage: 'Failed to extend token cleanup lock',
      releaseFailedMessage: 'Failed to release token cleanup lock',
      onLocked: () => ({
        refreshTokensDeleted: 0,
        durationMs: 0,
      }),
    });
  },
};
