import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@core/logger';
import { Errors } from '@core/errors';
import type { DocumentType } from '@knowledge-agent/shared/types';
import { documentIndexBackfillRunRepository } from '../repositories/document-index-backfill-run.repository';
import { documentIndexBackfillItemRepository } from '../repositories/document-index-backfill-item.repository';
import type { DocumentIndexBackfillItem } from '@core/db/schema/document/document-index-backfill-items.schema';
import type { DocumentIndexBackfillRun } from '@core/db/schema/document/document-index-backfill-runs.schema';

const logger = createLogger('document-index-backfill-progress.service');

export type BackfillRunTrigger = 'manual' | 'scheduled';
export type BackfillItemOutcome = 'completed' | 'failed' | 'skipped';

export interface BackfillRunCreateOptions {
  knowledgeBaseId?: string;
  documentType?: DocumentType;
  includeIndexed?: boolean;
  includeProcessing?: boolean;
  batchSize: number;
  enqueueDelayMs: number;
  candidateCount: number;
  cursorOffset?: number;
  trigger?: BackfillRunTrigger;
  createdBy?: string;
}

export const documentIndexBackfillProgressService = {
  async createRun(options: BackfillRunCreateOptions): Promise<DocumentIndexBackfillRun> {
    const runId = uuidv4();
    return documentIndexBackfillRunRepository.create({
      id: runId,
      status: 'running',
      trigger: options.trigger ?? 'manual',
      knowledgeBaseId: options.knowledgeBaseId,
      documentType: options.documentType,
      includeIndexed: options.includeIndexed ?? false,
      includeProcessing: options.includeProcessing ?? false,
      batchSize: options.batchSize,
      enqueueDelayMs: options.enqueueDelayMs,
      candidateCount: options.candidateCount,
      cursorOffset: options.cursorOffset ?? 0,
      hasMore: true,
      createdBy: options.createdBy,
    });
  },

  async getRun(runId: string): Promise<DocumentIndexBackfillRun | undefined> {
    return documentIndexBackfillRunRepository.findById(runId);
  },

  async listRecentRuns(limit?: number): Promise<DocumentIndexBackfillRun[]> {
    return documentIndexBackfillRunRepository.listRecent(limit);
  },

  async ensureItem(params: {
    runId: string;
    documentId: string;
    userId: string;
    knowledgeBaseId: string;
    documentVersion: number;
  }): Promise<DocumentIndexBackfillItem> {
    const existing = await documentIndexBackfillItemRepository.findByRunAndDocument(
      params.runId,
      params.documentId
    );
    if (existing) return existing;

    return documentIndexBackfillItemRepository.create({
      id: uuidv4(),
      runId: params.runId,
      documentId: params.documentId,
      userId: params.userId,
      knowledgeBaseId: params.knowledgeBaseId,
      documentVersion: params.documentVersion,
      status: 'pending',
    });
  },

  async markEnqueued(params: { runId: string; documentId: string; jobId?: string }): Promise<void> {
    const updated = await documentIndexBackfillItemRepository.updateStatusIf(
      params.runId,
      params.documentId,
      ['pending'],
      {
        status: 'enqueued',
        jobId: params.jobId,
        enqueuedAt: new Date(),
        error: null,
      }
    );

    if (!updated) return;
    await documentIndexBackfillRunRepository.incrementCounts(params.runId, { enqueuedCount: 1 });
  },

  async markProcessing(params: {
    runId: string;
    documentId: string;
    jobId?: string;
  }): Promise<void> {
    await documentIndexBackfillItemRepository.updateStatusIf(
      params.runId,
      params.documentId,
      ['pending', 'enqueued'],
      {
        status: 'processing',
        jobId: params.jobId,
      }
    );
  },

  async recordOutcome(params: {
    runId: string;
    documentId: string;
    outcome: BackfillItemOutcome;
    error?: string;
  }): Promise<void> {
    const now = new Date();
    const nextStatus = params.outcome === 'failed' ? 'failed' : params.outcome;
    const updated = await documentIndexBackfillItemRepository.updateStatusIf(
      params.runId,
      params.documentId,
      ['pending', 'enqueued', 'processing'],
      {
        status: nextStatus,
        error: params.error,
        completedAt: now,
      }
    );

    if (!updated) return;

    await documentIndexBackfillRunRepository.incrementCounts(params.runId, {
      completedCount: params.outcome === 'completed' ? 1 : 0,
      failedCount: params.outcome === 'failed' ? 1 : 0,
      skippedCount: params.outcome === 'skipped' ? 1 : 0,
    });

    if (params.outcome === 'failed' && params.error) {
      await this.touchRunError(params.runId, params.error);
    }

    await this.maybeFinalizeRun(params.runId);
  },

  async updateCursor(params: {
    runId: string;
    cursorOffset: number;
    hasMore: boolean;
  }): Promise<void> {
    const run = await documentIndexBackfillRunRepository.findById(params.runId);
    if (!run || ['completed', 'failed', 'cancelled'].includes(run.status)) return;

    await documentIndexBackfillRunRepository.update(params.runId, {
      cursorOffset: params.cursorOffset,
      hasMore: params.hasMore,
      status: params.hasMore ? 'running' : 'draining',
    });

    if (!params.hasMore) {
      await this.maybeFinalizeRun(params.runId);
    }
  },

  async markRunFailed(params: { runId: string; error: string }): Promise<void> {
    await documentIndexBackfillRunRepository.update(params.runId, {
      status: 'failed',
      lastError: params.error,
    });
  },

  async maybeFinalizeRun(runId: string): Promise<void> {
    const run = await documentIndexBackfillRunRepository.findById(runId);
    if (!run) return;
    if (run.status !== 'draining') return;

    const doneCount = run.completedCount + run.failedCount + run.skippedCount;
    if (doneCount < run.enqueuedCount) return;

    await documentIndexBackfillRunRepository.update(runId, {
      status: 'completed',
      completedAt: new Date(),
    });
  },

  async getLatestActiveRun(
    trigger: BackfillRunTrigger
  ): Promise<DocumentIndexBackfillRun | undefined> {
    return documentIndexBackfillRunRepository.findLatestActiveRun(trigger);
  },

  async ensureRunAvailable(runId: string): Promise<DocumentIndexBackfillRun> {
    const run = await documentIndexBackfillRunRepository.findById(runId);
    if (!run) {
      throw Errors.notFound('Backfill run');
    }
    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      throw Errors.conflict(`Backfill run is not active: ${runId} (${run.status})`);
    }
    return run;
  },

  async touchRunError(runId: string, error: string): Promise<void> {
    logger.warn({ runId, error }, 'Backfill run error');
    await documentIndexBackfillRunRepository.update(runId, { lastError: error });
  },
};
