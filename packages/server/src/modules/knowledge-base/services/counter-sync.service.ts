import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import { knowledgeBaseRepository } from '../repositories/knowledge-base.repository';

const logger = createLogger('counter-sync.service');

export interface SyncResult {
  knowledgeBaseId: string;
  name: string;
  documentCount: { before: number; after: number; changed: boolean };
  totalChunks: { before: number; after: number; changed: boolean };
}

/**
 * Counter sync service for reconciling knowledge base counters
 */
export const counterSyncService = {
  /**
   * Sync counters for a single knowledge base
   */
  async syncKnowledgeBase(kbId: string): Promise<SyncResult> {
    const kb = await knowledgeBaseRepository.findById(kbId);
    if (!kb) {
      throw Errors.notFound('Knowledge base');
    }

    // Get actual counts from documents
    const actualDocumentCount = await knowledgeBaseRepository.countDocumentsByKnowledgeBaseId(kbId);
    const actualTotalChunks =
      await knowledgeBaseRepository.sumDocumentChunksByKnowledgeBaseId(kbId);

    const result: SyncResult = {
      knowledgeBaseId: kbId,
      name: kb.name,
      documentCount: {
        before: kb.documentCount,
        after: actualDocumentCount,
        changed: kb.documentCount !== actualDocumentCount,
      },
      totalChunks: {
        before: kb.totalChunks,
        after: actualTotalChunks,
        changed: kb.totalChunks !== actualTotalChunks,
      },
    };

    // Update if any counter changed
    if (result.documentCount.changed || result.totalChunks.changed) {
      await knowledgeBaseRepository.updateCounters(kbId, {
        documentCount: actualDocumentCount,
        totalChunks: actualTotalChunks,
      });

      logger.info(
        {
          kbId,
          name: kb.name,
          documentCount: result.documentCount,
          totalChunks: result.totalChunks,
        },
        'Knowledge base counters synced'
      );
    }

    return result;
  },

  /**
   * Sync counters for all knowledge bases owned by a user
   */
  async syncUserKnowledgeBases(userId: string): Promise<SyncResult[]> {
    const kbs = await knowledgeBaseRepository.listByUser(userId);
    const results: SyncResult[] = [];

    for (const kb of kbs) {
      try {
        const result = await this.syncKnowledgeBase(kb.id);
        results.push(result);
      } catch (err) {
        logger.error({ kbId: kb.id, err }, 'Failed to sync knowledge base counters');
      }
    }

    return results;
  },

  /**
   * Sync counters for all knowledge bases (admin operation)
   */
  async syncAll(): Promise<{ total: number; synced: number; errors: number }> {
    // Get all non-deleted knowledge bases
    const allKbs = await knowledgeBaseRepository.listAll();

    let synced = 0;
    let errors = 0;

    for (const kb of allKbs) {
      try {
        await this.syncKnowledgeBase(kb.id);
        synced++;
      } catch (err) {
        logger.error({ kbId: kb.id, err }, 'Failed to sync knowledge base counters');
        errors++;
      }
    }

    logger.info({ total: allKbs.length, synced, errors }, 'Counter sync completed');

    return { total: allKbs.length, synced, errors };
  },
};
