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
  },
  enqueueDocumentProcessing: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/env', () => mocks.env);

vi.mock('@modules/document/repositories/document.repository', () => ({
  documentRepository: mocks.documentRepository,
}));

vi.mock('@modules/rag/queue/document-processing.queue', () => ({
  enqueueDocumentProcessing: mocks.enqueueDocumentProcessing,
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => mocks.logger,
}));

import { documentIndexBackfillService } from '@modules/document-index/services/document-index-backfill.service';

describe('documentIndexBackfillService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(mocks.enqueueDocumentProcessing).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dryRun: true,
      enqueuedCount: 0,
      limit: 10,
      offset: 20,
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

    expect(mocks.enqueueDocumentProcessing).toHaveBeenNthCalledWith(1, 'doc-1', 'user-1', {
      targetDocumentVersion: 3,
      reason: 'backfill',
    });
    expect(mocks.enqueueDocumentProcessing).toHaveBeenNthCalledWith(2, 'doc-2', 'user-2', {
      targetDocumentVersion: 1,
      reason: 'backfill',
    });
    expect(result).toMatchObject({
      dryRun: false,
      enqueuedCount: 2,
      hasMore: true,
    });
  });
});
