import { backfillConfig } from '@config/env';
import { runExclusiveTask } from '@core/coordination';
import { dispatchDocumentProcessing } from '@core/document-processing';
import {
  documentRepository,
  type DocumentBackfillCandidate,
} from '@modules/document/public/repositories';
import type { DocumentType } from '@groundpath/shared/types';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import { documentIndexBackfillProgressService } from './document-index-backfill-progress.service';

const logger = createLogger('document-index-backfill.service');
const SCHEDULED_BACKFILL_LOCK_KEY = 'document-index:scheduled-backfill:lock';

export interface DocumentIndexBackfillOptions {
  knowledgeBaseId?: string;
  documentType?: DocumentType;
  includeIndexed?: boolean;
  includeProcessing?: boolean;
  limit?: number;
  offset?: number;
  dryRun?: boolean;
  runId?: string;
  trigger?: 'manual' | 'scheduled';
  createdBy?: string;
}

interface DocumentIndexBackfillListOptions {
  knowledgeBaseId?: string;
  documentType?: DocumentType;
  includeIndexed?: boolean;
  includeProcessing?: boolean;
  limit?: number;
  offset?: number;
  excludeRunId?: string;
}

export interface DocumentIndexBackfillResult {
  documents: DocumentBackfillCandidate[];
  hasMore: boolean;
  enqueuedCount: number;
  dryRun: boolean;
  limit: number;
  offset: number;
  runId?: string;
}

export type ScheduledDocumentIndexBackfillResult =
  | DocumentIndexBackfillResult
  | {
      runId?: string;
      status: 'running' | 'draining' | 'completed' | 'failed' | 'cancelled' | 'skipped';
      hasMore: boolean;
      message: string;
    };

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const documentIndexBackfillService = {
  async listCandidates(options: DocumentIndexBackfillListOptions = {}): Promise<{
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
      excludeRunId: options.excludeRunId,
      limit,
      offset,
    });

    return {
      ...result,
      limit,
      offset,
    };
  },

  async enqueueBackfill(
    options: DocumentIndexBackfillOptions = {}
  ): Promise<DocumentIndexBackfillResult> {
    let runId = options.runId;
    let runCursorOffset = options.offset ?? 0;
    let effectiveOptions: DocumentIndexBackfillListOptions = options;

    if (runId) {
      const run = await documentIndexBackfillProgressService.ensureRunAvailable(runId);
      runCursorOffset = run.cursorOffset;
      effectiveOptions = {
        ...options,
        knowledgeBaseId: run.knowledgeBaseId ?? undefined,
        documentType: run.documentType ?? undefined,
        includeIndexed: run.includeIndexed,
        includeProcessing: run.includeProcessing,
        limit: options.limit ?? run.batchSize,
        offset: 0,
        excludeRunId: runId,
      };
    }

    const plan = await this.listCandidates(effectiveOptions);
    const resultOffset = runId ? runCursorOffset : plan.offset;
    const dryRun = options.dryRun ?? false;

    if (dryRun) {
      logger.info(
        {
          candidateCount: plan.documents.length,
          hasMore: plan.hasMore,
          limit: plan.limit,
          offset: resultOffset,
        },
        'Document index backfill dry run completed'
      );

      return {
        ...plan,
        enqueuedCount: 0,
        dryRun: true,
        offset: resultOffset,
        runId,
      };
    }

    if (!runId) {
      const candidateCount = await documentRepository.countBackfillCandidates({
        knowledgeBaseId: options.knowledgeBaseId,
        documentType: options.documentType,
        includeIndexed: options.includeIndexed,
        includeProcessing: options.includeProcessing,
      });
      const createRunResult = await documentIndexBackfillProgressService.createRun({
        knowledgeBaseId: options.knowledgeBaseId,
        documentType: options.documentType,
        includeIndexed: options.includeIndexed,
        includeProcessing: options.includeProcessing,
        batchSize: plan.limit,
        enqueueDelayMs: backfillConfig.enqueueDelayMs,
        candidateCount,
        cursorOffset: resultOffset,
        trigger: options.trigger ?? 'manual',
        createdBy: options.createdBy,
      });
      runId = createRunResult.run.id;

      if (!createRunResult.created) {
        return this.enqueueBackfill({
          ...options,
          runId,
          trigger: options.trigger ?? 'manual',
        });
      }
    }

    if (!runId) {
      throw Errors.internal('Backfill run initialization failed: missing runId');
    }

    let enqueuedCount = 0;

    for (const [index, document] of plan.documents.entries()) {
      const item = await documentIndexBackfillProgressService.ensureItem({
        runId,
        documentId: document.id,
        userId: document.userId,
        knowledgeBaseId: document.knowledgeBaseId,
        documentVersion: document.currentVersion,
      });

      if (item.status !== 'pending') {
        continue;
      }

      try {
        const jobId = await dispatchDocumentProcessing(document.id, document.userId, {
          targetDocumentVersion: document.currentVersion,
          reason: 'backfill',
          backfillRunId: runId,
        });
        await documentIndexBackfillProgressService.markEnqueued({
          runId,
          documentId: document.id,
          jobId,
        });
        enqueuedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await documentIndexBackfillProgressService.recordOutcome({
          runId,
          documentId: document.id,
          outcome: 'failed',
          error: message,
        });
      }

      if (backfillConfig.enqueueDelayMs > 0 && index < plan.documents.length - 1) {
        await sleep(backfillConfig.enqueueDelayMs);
      }
    }

    if (runId) {
      await documentIndexBackfillProgressService.updateCursor({
        runId,
        cursorOffset: resultOffset + plan.documents.length,
        hasMore: plan.hasMore,
      });
    }

    logger.info(
      {
        enqueuedCount,
        hasMore: plan.hasMore,
        limit: plan.limit,
        offset: resultOffset,
      },
      'Document index backfill enqueue completed'
    );

    return {
      ...plan,
      enqueuedCount,
      dryRun: false,
      offset: resultOffset,
      runId,
    };
  },

  async getRun(runId: string) {
    return documentIndexBackfillProgressService.getRun(runId);
  },

  async listRuns(limit?: number) {
    return documentIndexBackfillProgressService.listRecentRuns(limit);
  },

  async runScheduledBackfill(): Promise<ScheduledDocumentIndexBackfillResult> {
    return runExclusiveTask<ScheduledDocumentIndexBackfillResult>(
      async () => {
        const activeRun =
          await documentIndexBackfillProgressService.getLatestActiveRun('scheduled');
        if (activeRun) {
          if (!activeRun.hasMore) {
            return {
              runId: activeRun.id,
              status: activeRun.status,
              hasMore: activeRun.hasMore,
              message: 'No more backfill candidates for scheduled run',
            };
          }

          return this.enqueueBackfill({ runId: activeRun.id, trigger: 'scheduled' });
        }

        return this.enqueueBackfill({ trigger: 'scheduled' });
      },
      {
        key: SCHEDULED_BACKFILL_LOCK_KEY,
        logger,
        lockBusyMessage:
          'Skipping scheduled document index backfill because another instance already holds the lock',
        lockLostMessage: 'Failed to extend scheduled document index backfill lock',
        releaseFailedMessage: 'Failed to release scheduled document index backfill lock',
        onLocked: () => ({
          status: 'skipped' as const,
          hasMore: true,
          message:
            'Skipped scheduled backfill because another scheduler instance already holds the coordination lock',
        }),
      }
    );
  },
};
