import { loggingConfig } from '@core/config/env';
import { createLogger } from '@core/logger';
import { systemLogger } from '@core/logger/system-logger';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';

const logger = createLogger('token-cleanup.service');

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
};
