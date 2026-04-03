import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  backfillProgress: {
    markProcessing: vi.fn(),
    recordOutcome: vi.fn(),
  },
}));

vi.mock('@modules/document-index/services/document-index-backfill-progress.service', () => ({
  documentIndexBackfillProgressService: mocks.backfillProgress,
}));

import { documentProcessingBackfillLifecycleListener } from '@modules/document-index/services/document-processing-backfill.listener';

describe('documentProcessingBackfillLifecycleListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks backfill items as processing when a backfill job starts', async () => {
    await documentProcessingBackfillLifecycleListener.onStarted?.({
      documentId: 'doc-1',
      userId: 'user-1',
      targetDocumentVersion: 3,
      reason: 'backfill',
      backfillRunId: 'run-1',
      jobId: 'job-1',
      attempt: 1,
    });

    expect(mocks.backfillProgress.markProcessing).toHaveBeenCalledWith({
      runId: 'run-1',
      documentId: 'doc-1',
      jobId: 'job-1',
    });
  });

  it('records backfill outcomes when a backfill job settles', async () => {
    await documentProcessingBackfillLifecycleListener.onSettled?.({
      documentId: 'doc-2',
      userId: 'user-2',
      targetDocumentVersion: 4,
      reason: 'backfill',
      backfillRunId: 'run-2',
      outcome: 'failed',
      error: 'queue unavailable',
    });

    expect(mocks.backfillProgress.recordOutcome).toHaveBeenCalledWith({
      runId: 'run-2',
      documentId: 'doc-2',
      outcome: 'failed',
      error: 'queue unavailable',
    });
  });

  it('ignores non-backfill lifecycle events', async () => {
    await documentProcessingBackfillLifecycleListener.onStarted?.({
      documentId: 'doc-3',
      userId: 'user-3',
      targetDocumentVersion: 2,
      reason: 'edit',
    });
    await documentProcessingBackfillLifecycleListener.onSettled?.({
      documentId: 'doc-3',
      userId: 'user-3',
      targetDocumentVersion: 2,
      reason: 'recovery',
      outcome: 'completed',
    });

    expect(mocks.backfillProgress.markProcessing).not.toHaveBeenCalled();
    expect(mocks.backfillProgress.recordOutcome).not.toHaveBeenCalled();
  });
});
