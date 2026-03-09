import { backfillConfig } from '@config/env';
import {
  documentRepository,
  type DocumentBackfillCandidate,
} from '@modules/document/repositories/document.repository';
import { enqueueDocumentProcessing } from '@modules/rag/queue/document-processing.queue';
import type { DocumentType } from '@knowledge-agent/shared/types';
import { createLogger } from '@shared/logger';

const logger = createLogger('document-index-backfill.service');

export interface DocumentIndexBackfillOptions {
  knowledgeBaseId?: string;
  documentType?: DocumentType;
  includeIndexed?: boolean;
  includeProcessing?: boolean;
  limit?: number;
  offset?: number;
  dryRun?: boolean;
}

export interface DocumentIndexBackfillResult {
  documents: DocumentBackfillCandidate[];
  hasMore: boolean;
  enqueuedCount: number;
  dryRun: boolean;
  limit: number;
  offset: number;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const documentIndexBackfillService = {
  async listCandidates(
    options: Omit<DocumentIndexBackfillOptions, 'dryRun'> = {}
  ): Promise<{
    documents: DocumentBackfillCandidate[];
    hasMore: boolean;
    limit: number;
    offset: number;
  }> {
    const limit = options.limit ?? backfillConfig.batchSize;
    const offset = options.offset ?? 0;
    const result = await documentRepository.listBackfillCandidates({
      knowledgeBaseId: options.knowledgeBaseId,
      documentType: options.documentType,
      includeIndexed: options.includeIndexed,
      includeProcessing: options.includeProcessing,
      limit,
      offset,
    });

    return {
      ...result,
      limit,
      offset,
    };
  },

  async enqueueBackfill(options: DocumentIndexBackfillOptions = {}): Promise<DocumentIndexBackfillResult> {
    const plan = await this.listCandidates(options);
    const dryRun = options.dryRun ?? false;

    if (dryRun) {
      logger.info(
        {
          candidateCount: plan.documents.length,
          hasMore: plan.hasMore,
          limit: plan.limit,
          offset: plan.offset,
        },
        'Document index backfill dry run completed'
      );

      return {
        ...plan,
        enqueuedCount: 0,
        dryRun: true,
      };
    }

    for (const [index, document] of plan.documents.entries()) {
      await enqueueDocumentProcessing(document.id, document.userId, {
        targetDocumentVersion: document.currentVersion,
        reason: 'backfill',
      });

      if (backfillConfig.enqueueDelayMs > 0 && index < plan.documents.length - 1) {
        await sleep(backfillConfig.enqueueDelayMs);
      }
    }

    logger.info(
      {
        enqueuedCount: plan.documents.length,
        hasMore: plan.hasMore,
        limit: plan.limit,
        offset: plan.offset,
      },
      'Document index backfill enqueue completed'
    );

    return {
      ...plan,
      enqueuedCount: plan.documents.length,
      dryRun: false,
    };
  },
};
