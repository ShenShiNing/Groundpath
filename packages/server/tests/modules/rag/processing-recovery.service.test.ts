import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  documentRepository: {
    listStaleProcessingDocuments: vi.fn(),
    resetStaleProcessingDocument: vi.fn(),
  },
  processingService: {
    releaseProcessingLock: vi.fn(),
  },
}));

vi.mock('@config/env', () => ({
  documentConfig: {
    processingTimeoutMinutes: 30,
    processingRecoveryBatchSize: 100,
  },
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@modules/document', () => ({
  documentRepository: mocks.documentRepository,
}));

vi.mock('@modules/rag/services/processing.service', () => ({
  processingService: mocks.processingService,
}));

import { processingRecoveryService } from '@modules/rag/services/processing-recovery.service';

describe('processingRecoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should compute stale cutoff from timeout minutes', () => {
    const now = new Date('2026-03-11T12:00:00.000Z');
    const result = processingRecoveryService.buildStaleBefore(now);

    expect(result.toISOString()).toBe('2026-03-11T11:30:00.000Z');
  });

  it('should recover stale processing documents and release in-memory locks', async () => {
    const now = new Date('2026-03-11T12:00:00.000Z');
    const firstStartedAt = new Date('2026-03-11T10:00:00.000Z');
    const secondStartedAt = new Date('2026-03-11T10:15:00.000Z');

    mocks.documentRepository.listStaleProcessingDocuments.mockResolvedValue([
      {
        id: 'doc-1',
        userId: 'user-1',
        knowledgeBaseId: 'kb-1',
        title: 'First Doc',
        processingStartedAt: firstStartedAt,
      },
      {
        id: 'doc-2',
        userId: 'user-2',
        knowledgeBaseId: 'kb-2',
        title: 'Second Doc',
        processingStartedAt: secondStartedAt,
      },
    ]);
    mocks.documentRepository.resetStaleProcessingDocument
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await processingRecoveryService.recoverStaleProcessing(now);

    expect(mocks.documentRepository.listStaleProcessingDocuments).toHaveBeenCalledWith(
      new Date('2026-03-11T11:30:00.000Z'),
      100
    );
    expect(mocks.documentRepository.resetStaleProcessingDocument).toHaveBeenNthCalledWith(
      1,
      'doc-1',
      new Date('2026-03-11T11:30:00.000Z')
    );
    expect(mocks.documentRepository.resetStaleProcessingDocument).toHaveBeenNthCalledWith(
      2,
      'doc-2',
      new Date('2026-03-11T11:30:00.000Z')
    );
    expect(mocks.processingService.releaseProcessingLock).toHaveBeenCalledTimes(1);
    expect(mocks.processingService.releaseProcessingLock).toHaveBeenCalledWith('doc-1');
    expect(result).toEqual({
      timeoutMinutes: 30,
      staleBefore: '2026-03-11T11:30:00.000Z',
      scannedCount: 2,
      recoveredCount: 1,
      skippedCount: 1,
      recoveredDocumentIds: ['doc-1'],
      skippedDocumentIds: ['doc-2'],
    });
  });

  it('should keep going when one recovery attempt throws', async () => {
    const now = new Date('2026-03-11T12:00:00.000Z');

    mocks.documentRepository.listStaleProcessingDocuments.mockResolvedValue([
      {
        id: 'doc-1',
        userId: 'user-1',
        knowledgeBaseId: 'kb-1',
        title: 'First Doc',
        processingStartedAt: new Date('2026-03-11T10:00:00.000Z'),
      },
      {
        id: 'doc-2',
        userId: 'user-2',
        knowledgeBaseId: 'kb-2',
        title: 'Second Doc',
        processingStartedAt: new Date('2026-03-11T10:15:00.000Z'),
      },
    ]);
    mocks.documentRepository.resetStaleProcessingDocument
      .mockRejectedValueOnce(new Error('db error'))
      .mockResolvedValueOnce(true);

    const result = await processingRecoveryService.recoverStaleProcessing(now);

    expect(mocks.processingService.releaseProcessingLock).toHaveBeenCalledTimes(1);
    expect(mocks.processingService.releaseProcessingLock).toHaveBeenCalledWith('doc-2');
    expect(result.recoveredDocumentIds).toEqual(['doc-2']);
    expect(result.skippedDocumentIds).toEqual(['doc-1']);
  });
});
