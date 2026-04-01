import { chatConfig } from '@core/config/env/configs';
import { createLogger } from '@core/logger';
import { systemLogger } from '@core/logger/system-logger';
import { conversationRepository } from '../repositories/conversation.repository';

const logger = createLogger('conversation-cleanup.service');

export interface ConversationCleanupResult {
  deletedConversations: number;
  durationMs: number;
}

function getCutoffDate(retentionDays: number, now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff;
}

export const conversationCleanupService = {
  async cleanup(now: Date = new Date()): Promise<ConversationCleanupResult> {
    const startedAt = Date.now();
    const cutoffDate = getCutoffDate(chatConfig.deletedConversationRetentionDays, now);
    let deletedConversations = 0;
    let deleted: number;

    logger.info(
      {
        cutoffDate,
        batchSize: chatConfig.deletedConversationCleanupBatchSize,
      },
      'Starting soft-deleted conversation cleanup'
    );

    do {
      deleted = await conversationRepository.deleteSoftDeletedOlderThan(
        cutoffDate,
        chatConfig.deletedConversationCleanupBatchSize
      );
      deletedConversations += deleted;
    } while (deleted === chatConfig.deletedConversationCleanupBatchSize);

    const result: ConversationCleanupResult = {
      deletedConversations,
      durationMs: Date.now() - startedAt,
    };

    logger.info(result, 'Soft-deleted conversation cleanup completed');
    systemLogger.schedulerRun(
      'chat.cleanup',
      'Scheduled soft-deleted conversation cleanup completed',
      result.durationMs,
      {
        deletedConversations,
        retentionDays: chatConfig.deletedConversationRetentionDays,
      }
    );

    return result;
  },
};
