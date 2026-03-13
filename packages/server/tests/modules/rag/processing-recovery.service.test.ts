import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    processingTimeoutMinutes: 30,
    processingRecoveryBatchSize: 100,
    processingRecoveryRequeueEnabled: false,
  },
  documentRepository: {
    listStaleProcessingDocuments: vi.fn(),
    resetStaleProcessingDocument: vi.fn(),
  },
  processingService: {
    releaseProcessingLock: vi.fn(),
  },
  enqueueDocumentProcessing: vi.fn(),
}));

vi.mock('@config/env', () => ({
  documentConfig: mocks.env,
}));

vi.mock('@core/logger', () => ({
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

vi.mock('@modules/rag/queue/document-processing.queue', () => ({
  enqueueDocumentProcessing: mocks.enqueueDocumentProcessing,
}));

import { processingRecoveryService } from '@modules/rag/services/processing-recovery.service';

describe('processingRecoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.processingRecoveryRequeueEnabled = false;
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
        currentVersion: 3,
        publishGeneration: 4,
        processingStartedAt: firstStartedAt,
      },
      {
        id: 'doc-2',
        userId: 'user-2',
        knowledgeBaseId: 'kb-2',
        title: 'Second Doc',
        currentVersion: 5,
        publishGeneration: 8,
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
      requeueEnabled: false,
      scannedCount: 2,
      recoveredCount: 1,
      skippedCount: 1,
      requeuedCount: 0,
      requeueFailedCount: 0,
      recoveredDocumentIds: ['doc-1'],
      skippedDocumentIds: ['doc-2'],
      requeuedDocumentIds: [],
      requeueFailedDocumentIds: [],
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
        currentVersion: 2,
        publishGeneration: 4,
        processingStartedAt: new Date('2026-03-11T10:00:00.000Z'),
      },
      {
        id: 'doc-2',
        userId: 'user-2',
        knowledgeBaseId: 'kb-2',
        title: 'Second Doc',
        currentVersion: 6,
        publishGeneration: 9,
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
    expect(result.requeuedDocumentIds).toEqual([]);
    expect(result.requeueFailedDocumentIds).toEqual([]);
  });

  it('should re-enqueue recovered documents when recovery requeue is enabled', async () => {
    mocks.env.processingRecoveryRequeueEnabled = true;
    const now = new Date('2026-03-11T12:00:00.000Z');

    mocks.documentRepository.listStaleProcessingDocuments.mockResolvedValue([
      {
        id: 'doc-1',
        userId: 'user-1',
        knowledgeBaseId: 'kb-1',
        title: 'Recovered Doc',
        currentVersion: 7,
        publishGeneration: 11,
        processingStartedAt: new Date('2026-03-11T10:00:00.000Z'),
      },
    ]);
    mocks.documentRepository.resetStaleProcessingDocument.mockResolvedValueOnce(true);
    mocks.enqueueDocumentProcessing.mockResolvedValueOnce('job-recovery-1');

    const result = await processingRecoveryService.recoverStaleProcessing(now);

    expect(mocks.processingService.releaseProcessingLock).toHaveBeenCalledWith('doc-1');
    expect(mocks.enqueueDocumentProcessing).toHaveBeenCalledWith('doc-1', 'user-1', {
      targetDocumentVersion: 7,
      reason: 'recovery',
      jobIdSuffix: 'recovery-g12',
    });
    expect(result).toMatchObject({
      requeueEnabled: true,
      recoveredDocumentIds: ['doc-1'],
      requeuedDocumentIds: ['doc-1'],
      requeueFailedDocumentIds: [],
      requeuedCount: 1,
      requeueFailedCount: 0,
    });
  });

  it('should keep recovered documents pending when recovery requeue fails', async () => {
    mocks.env.processingRecoveryRequeueEnabled = true;
    const now = new Date('2026-03-11T12:00:00.000Z');

    mocks.documentRepository.listStaleProcessingDocuments.mockResolvedValue([
      {
        id: 'doc-1',
        userId: 'user-1',
        knowledgeBaseId: 'kb-1',
        title: 'Recovered Doc',
        currentVersion: 4,
        publishGeneration: 5,
        processingStartedAt: new Date('2026-03-11T10:00:00.000Z'),
      },
    ]);
    mocks.documentRepository.resetStaleProcessingDocument.mockResolvedValueOnce(true);
    mocks.enqueueDocumentProcessing.mockRejectedValueOnce(new Error('redis offline'));

    const result = await processingRecoveryService.recoverStaleProcessing(now);

    expect(mocks.processingService.releaseProcessingLock).toHaveBeenCalledWith('doc-1');
    expect(mocks.enqueueDocumentProcessing).toHaveBeenCalledWith('doc-1', 'user-1', {
      targetDocumentVersion: 4,
      reason: 'recovery',
      jobIdSuffix: 'recovery-g6',
    });
    expect(result).toMatchObject({
      requeueEnabled: true,
      recoveredDocumentIds: ['doc-1'],
      requeuedDocumentIds: [],
      requeueFailedDocumentIds: ['doc-1'],
      requeuedCount: 0,
      requeueFailedCount: 1,
    });
  });
});
