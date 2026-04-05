import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uuid: vi.fn(() => 'generated-backfill-item-id'),
  runRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    listRecent: vi.fn(),
    incrementCounts: vi.fn(),
    update: vi.fn(),
    findLatestActiveRun: vi.fn(),
  },
  itemRepository: {
    findByRunAndDocument: vi.fn(),
    create: vi.fn(),
    updateStatusIf: vi.fn(),
  },
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: mocks.uuid,
}));

vi.mock('@core/logger', () => ({
  createLogger: () => mocks.logger,
}));

vi.mock('@modules/document-index/repositories/document-index-backfill-run.repository', () => ({
  documentIndexBackfillRunRepository: mocks.runRepository,
}));

vi.mock('@modules/document-index/repositories/document-index-backfill-item.repository', () => ({
  documentIndexBackfillItemRepository: mocks.itemRepository,
}));

import { documentIndexBackfillProgressService } from '@modules/document-index/services/document-index-backfill-progress.service';

describe('documentIndexBackfillProgressService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing item when the run/document pair is already present', async () => {
    mocks.itemRepository.findByRunAndDocument.mockResolvedValue({
      id: 'existing-item',
      runId: 'run-1',
      documentId: 'doc-1',
      status: 'pending',
    });

    const result = await documentIndexBackfillProgressService.ensureItem({
      runId: 'run-1',
      documentId: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      documentVersion: 2,
    });

    expect(result).toMatchObject({ id: 'existing-item' });
    expect(mocks.itemRepository.create).not.toHaveBeenCalled();
  });

  it('creates a new item when none exists yet', async () => {
    mocks.itemRepository.findByRunAndDocument.mockResolvedValue(undefined);
    mocks.itemRepository.create.mockResolvedValue({
      id: 'generated-backfill-item-id',
      runId: 'run-1',
      documentId: 'doc-1',
      status: 'pending',
    });

    const result = await documentIndexBackfillProgressService.ensureItem({
      runId: 'run-1',
      documentId: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      documentVersion: 2,
    });

    expect(mocks.itemRepository.create).toHaveBeenCalledWith({
      id: 'generated-backfill-item-id',
      runId: 'run-1',
      documentId: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      documentVersion: 2,
      status: 'pending',
    });
    expect(result).toMatchObject({ id: 'generated-backfill-item-id' });
  });

  it('re-reads the item after a duplicate insert race', async () => {
    mocks.itemRepository.findByRunAndDocument
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: 'concurrent-item',
        runId: 'run-1',
        documentId: 'doc-1',
        status: 'pending',
      });
    mocks.itemRepository.create.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

    const result = await documentIndexBackfillProgressService.ensureItem({
      runId: 'run-1',
      documentId: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      documentVersion: 2,
    });

    expect(result).toMatchObject({ id: 'concurrent-item' });
  });

  it('creates scheduled runs normally when there is no uniqueness race', async () => {
    mocks.runRepository.create.mockResolvedValue({
      id: 'generated-backfill-item-id',
      status: 'running',
      trigger: 'scheduled',
    });

    const result = await documentIndexBackfillProgressService.createRun({
      batchSize: 50,
      enqueueDelayMs: 0,
      candidateCount: 3,
      trigger: 'scheduled',
    });

    expect(result).toEqual({
      run: {
        id: 'generated-backfill-item-id',
        status: 'running',
        trigger: 'scheduled',
      },
      created: true,
    });
  });

  it('reuses the active scheduled run after a duplicate insert race', async () => {
    mocks.runRepository.create.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
    mocks.runRepository.findLatestActiveRun.mockResolvedValue({
      id: 'scheduled-run-1',
      status: 'running',
      trigger: 'scheduled',
    });

    const result = await documentIndexBackfillProgressService.createRun({
      batchSize: 50,
      enqueueDelayMs: 0,
      candidateCount: 3,
      trigger: 'scheduled',
    });

    expect(mocks.runRepository.findLatestActiveRun).toHaveBeenCalledWith('scheduled');
    expect(result).toEqual({
      run: {
        id: 'scheduled-run-1',
        status: 'running',
        trigger: 'scheduled',
      },
      created: false,
    });
  });

  it('rethrows duplicate errors for non-scheduled runs', async () => {
    mocks.runRepository.create.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

    await expect(
      documentIndexBackfillProgressService.createRun({
        batchSize: 50,
        enqueueDelayMs: 0,
        candidateCount: 1,
        trigger: 'manual',
      })
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    expect(mocks.runRepository.findLatestActiveRun).not.toHaveBeenCalled();
  });
});
