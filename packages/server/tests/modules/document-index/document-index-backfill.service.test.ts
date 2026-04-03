import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    backfillConfig: {
      batchSize: 50,
      enqueueDelayMs: 0,
    },
  },
  documentRepository: {
    listBackfillCandidates: vi.fn(),
    countBackfillCandidates: vi.fn(),
  },
  dispatchDocumentProcessing: vi.fn(async () => 'job-1'),
  backfillProgress: {
    ensureRunAvailable: vi.fn(),
    createRun: vi.fn(),
    ensureItem: vi.fn(),
    markEnqueued: vi.fn(),
    recordOutcome: vi.fn(),
    touchRunError: vi.fn(),
    updateCursor: vi.fn(),
    getRun: vi.fn(),
    listRecentRuns: vi.fn(),
    getLatestActiveRun: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/env', async () => {
  const actual = await vi.importActual<typeof import('@config/env')>('@config/env');
  return {
    ...actual,
    ...mocks.env,
  };
});

vi.mock('@modules/document/public/repositories', () => ({
  documentRepository: mocks.documentRepository,
}));

vi.mock('@core/document-processing', () => ({
  dispatchDocumentProcessing: mocks.dispatchDocumentProcessing,
}));

vi.mock('@modules/document-index/services/document-index-backfill-progress.service', () => ({
  documentIndexBackfillProgressService: mocks.backfillProgress,
}));

vi.mock('@core/logger', () => ({
  createLogger: () => mocks.logger,
}));

import { documentIndexBackfillService } from '@modules/document-index/services/document-index-backfill.service';

describe('documentIndexBackfillService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentRepository.countBackfillCandidates.mockResolvedValue(1);
    mocks.documentRepository.listBackfillCandidates.mockResolvedValue({
      documents: [
        {
          id: 'doc-1',
          userId: 'user-1',
          title: 'Doc 1',
          knowledgeBaseId: 'kb-1',
          documentType: 'pdf',
          currentVersion: 3,
          activeIndexVersionId: null,
          processingStatus: 'completed',
          updatedAt: new Date('2026-03-09T10:00:00.000Z'),
        },
      ],
      hasMore: false,
    });
    mocks.backfillProgress.createRun.mockResolvedValue({
      id: 'run-1',
      status: 'running',
      trigger: 'manual',
      knowledgeBaseId: 'kb-1',
      documentType: null,
      includeIndexed: false,
      includeProcessing: false,
      batchSize: 50,
      enqueueDelayMs: 0,
      candidateCount: 1,
      enqueuedCount: 0,
      completedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      cursorOffset: 0,
      hasMore: false,
      lastError: null,
      startedAt: new Date('2026-03-09T10:00:00.000Z'),
      completedAt: null,
      createdBy: null,
      createdAt: new Date('2026-03-09T10:00:00.000Z'),
      updatedAt: new Date('2026-03-09T10:00:00.000Z'),
    });
    mocks.backfillProgress.ensureItem.mockResolvedValue({
      id: 'item-1',
      runId: 'run-1',
      documentId: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      documentVersion: 3,
      status: 'pending',
      jobId: null,
      error: null,
      createdAt: new Date('2026-03-09T10:00:00.000Z'),
      updatedAt: new Date('2026-03-09T10:00:00.000Z'),
      enqueuedAt: null,
      completedAt: null,
    });
  });

  it('lists backfill candidates with configured default limit', async () => {
    const result = await documentIndexBackfillService.listCandidates({
      knowledgeBaseId: 'kb-1',
    });

    expect(mocks.documentRepository.listBackfillCandidates).toHaveBeenCalledWith({
      knowledgeBaseId: 'kb-1',
      documentType: undefined,
      includeIndexed: undefined,
      includeProcessing: undefined,
      excludeRunId: undefined,
      limit: 50,
      offset: 0,
    });
    expect(result.limit).toBe(50);
    expect(result.documents).toHaveLength(1);
  });

  it('supports dry-run without enqueueing jobs', async () => {
    const result = await documentIndexBackfillService.enqueueBackfill({
      dryRun: true,
      limit: 10,
      offset: 20,
    });

    expect(mocks.dispatchDocumentProcessing).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dryRun: true,
      enqueuedCount: 0,
      limit: 10,
      offset: 20,
      runId: undefined,
    });
  });

  it('enqueues one backfill job per selected document', async () => {
    mocks.documentRepository.listBackfillCandidates.mockResolvedValue({
      documents: [
        {
          id: 'doc-1',
          userId: 'user-1',
          title: 'Doc 1',
          knowledgeBaseId: 'kb-1',
          documentType: 'pdf',
          currentVersion: 3,
          activeIndexVersionId: null,
          processingStatus: 'completed',
          updatedAt: new Date('2026-03-09T10:00:00.000Z'),
        },
        {
          id: 'doc-2',
          userId: 'user-2',
          title: 'Doc 2',
          knowledgeBaseId: 'kb-1',
          documentType: 'markdown',
          currentVersion: 1,
          activeIndexVersionId: null,
          processingStatus: 'failed',
          updatedAt: new Date('2026-03-09T11:00:00.000Z'),
        },
      ],
      hasMore: true,
    });

    const result = await documentIndexBackfillService.enqueueBackfill({
      includeIndexed: true,
      limit: 2,
    });

    expect(mocks.dispatchDocumentProcessing).toHaveBeenNthCalledWith(1, 'doc-1', 'user-1', {
      targetDocumentVersion: 3,
      reason: 'backfill',
      backfillRunId: 'run-1',
    });
    expect(mocks.dispatchDocumentProcessing).toHaveBeenNthCalledWith(2, 'doc-2', 'user-2', {
      targetDocumentVersion: 1,
      reason: 'backfill',
      backfillRunId: 'run-1',
    });
    expect(result).toMatchObject({
      dryRun: false,
      enqueuedCount: 2,
      hasMore: true,
      runId: 'run-1',
    });
  });

  it('resumes runs from the first unseen candidate instead of reusing offset pagination', async () => {
    mocks.backfillProgress.ensureRunAvailable.mockResolvedValue({
      id: 'run-1',
      status: 'running',
      trigger: 'scheduled',
      knowledgeBaseId: 'kb-1',
      documentType: null,
      includeIndexed: false,
      includeProcessing: false,
      batchSize: 50,
      enqueueDelayMs: 0,
      candidateCount: 10,
      enqueuedCount: 3,
      completedCount: 3,
      failedCount: 0,
      skippedCount: 0,
      cursorOffset: 3,
      hasMore: true,
      lastError: null,
      startedAt: new Date('2026-03-09T10:00:00.000Z'),
      completedAt: null,
      createdBy: null,
      createdAt: new Date('2026-03-09T10:00:00.000Z'),
      updatedAt: new Date('2026-03-09T10:00:00.000Z'),
    });

    const result = await documentIndexBackfillService.enqueueBackfill({
      runId: 'run-1',
      trigger: 'scheduled',
    });

    expect(mocks.documentRepository.listBackfillCandidates).toHaveBeenCalledWith({
      knowledgeBaseId: 'kb-1',
      documentType: undefined,
      includeIndexed: false,
      includeProcessing: false,
      excludeRunId: 'run-1',
      limit: 50,
      offset: 0,
    });
    expect(mocks.backfillProgress.updateCursor).toHaveBeenCalledWith({
      runId: 'run-1',
      cursorOffset: 4,
      hasMore: false,
    });
    expect(result.offset).toBe(3);
  });

  it('reports the actual enqueue success count when some jobs fail to enqueue', async () => {
    mocks.documentRepository.listBackfillCandidates.mockResolvedValue({
      documents: [
        {
          id: 'doc-1',
          userId: 'user-1',
          title: 'Doc 1',
          knowledgeBaseId: 'kb-1',
          documentType: 'pdf',
          currentVersion: 3,
          activeIndexVersionId: null,
          processingStatus: 'completed',
          updatedAt: new Date('2026-03-09T10:00:00.000Z'),
        },
        {
          id: 'doc-2',
          userId: 'user-2',
          title: 'Doc 2',
          knowledgeBaseId: 'kb-1',
          documentType: 'markdown',
          currentVersion: 1,
          activeIndexVersionId: null,
          processingStatus: 'failed',
          updatedAt: new Date('2026-03-09T11:00:00.000Z'),
        },
      ],
      hasMore: false,
    });
    mocks.backfillProgress.ensureItem
      .mockResolvedValueOnce({
        id: 'item-1',
        runId: 'run-1',
        documentId: 'doc-1',
        userId: 'user-1',
        knowledgeBaseId: 'kb-1',
        documentVersion: 3,
        status: 'pending',
        jobId: null,
        error: null,
        createdAt: new Date('2026-03-09T10:00:00.000Z'),
        updatedAt: new Date('2026-03-09T10:00:00.000Z'),
        enqueuedAt: null,
        completedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'item-2',
        runId: 'run-1',
        documentId: 'doc-2',
        userId: 'user-2',
        knowledgeBaseId: 'kb-1',
        documentVersion: 1,
        status: 'pending',
        jobId: null,
        error: null,
        createdAt: new Date('2026-03-09T10:00:00.000Z'),
        updatedAt: new Date('2026-03-09T10:00:00.000Z'),
        enqueuedAt: null,
        completedAt: null,
      });
    mocks.dispatchDocumentProcessing
      .mockResolvedValueOnce('job-1')
      .mockRejectedValueOnce(new Error('queue unavailable'));

    const result = await documentIndexBackfillService.enqueueBackfill({
      includeIndexed: true,
      limit: 2,
    });

    expect(mocks.backfillProgress.markEnqueued).toHaveBeenCalledTimes(1);
    expect(mocks.backfillProgress.recordOutcome).toHaveBeenCalledWith({
      runId: 'run-1',
      documentId: 'doc-2',
      outcome: 'failed',
      error: 'queue unavailable',
    });
    expect(result.enqueuedCount).toBe(1);
  });
});
