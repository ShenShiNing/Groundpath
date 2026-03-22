import { backfillConfig } from '@config/env';
import {
  documentRepository,
  type DocumentBackfillCandidate,
} from '@modules/document/public/repositories';
import { enqueueDocumentProcessing } from '@modules/rag/queue/document-processing.queue';
import type { DocumentType } from '@groundpath/shared/types';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import { documentIndexBackfillProgressService } from './document-index-backfill-progress.service';

const logger = createLogger('document-index-backfill.service');

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
      const run = await documentIndexBackfillProgressService.createRun({
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
      runId = run.id;
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
        const jobId = await enqueueDocumentProcessing(document.id, document.userId, {
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

  async runScheduledBackfill() {
    const activeRun = await documentIndexBackfillProgressService.getLatestActiveRun('scheduled');
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
};
