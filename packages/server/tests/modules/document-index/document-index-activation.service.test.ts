import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const afterCommitQueues = new Map<object, Array<() => Promise<void> | void>>();

  return {
    afterCommitQueues,
    flushAfterCommitCallbacks: async (tx: object) => {
      const callbacks = afterCommitQueues.get(tx) ?? [];
      afterCommitQueues.delete(tx);

      for (const callback of callbacks) {
        await callback();
      }
    },
    withTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>, tx?: unknown) => {
      if (tx) {
        return callback(tx);
      }

      const managedTx = {};
      const result = await callback(managedTx);
      const callbacks = afterCommitQueues.get(managedTx) ?? [];
      afterCommitQueues.delete(managedTx);

      for (const afterCommit of callbacks) {
        await afterCommit();
      }

      return result;
    }),
    afterTransactionCommit: vi.fn(async (callback: () => Promise<void> | void, tx?: unknown) => {
      if (!tx) {
        await callback();
        return;
      }

      const callbacks = afterCommitQueues.get(tx as object) ?? [];
      callbacks.push(callback);
      afterCommitQueues.set(tx as object, callbacks);
    }),
    documentIndexVersionRepository: {
      findById: vi.fn(),
      update: vi.fn(),
      supersedeActiveByDocumentId: vi.fn(),
    },
    documentRepository: {
      findById: vi.fn(),
      update: vi.fn(),
      publishBuild: vi.fn(),
    },
    knowledgeBaseService: {
      incrementTotalChunks: vi.fn(),
    },
    cacheService: {
      invalidateDocumentCaches: vi.fn(),
      invalidateQueryCaches: vi.fn(),
    },
  };
});

vi.mock('@core/db/db.utils', () => ({
  withTransaction: mocks.withTransaction,
  afterTransactionCommit: mocks.afterTransactionCommit,
  getDbContext: vi.fn((tx) => tx ?? {}),
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@modules/document-index/repositories/document-index-version.repository', () => ({
  documentIndexVersionRepository: mocks.documentIndexVersionRepository,
}));

vi.mock('@modules/document/repositories/document.repository', () => ({
  documentRepository: mocks.documentRepository,
}));

vi.mock('@modules/knowledge-base/services/knowledge-base.service', () => ({
  knowledgeBaseService: mocks.knowledgeBaseService,
}));

vi.mock('@modules/document-index/services/document-index-cache.service', () => ({
  documentIndexCacheService: mocks.cacheService,
}));

import { AppError } from '@core/errors/app-error';
import { documentIndexActivationService } from '@modules/document-index';

describe('documentIndexActivationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCommitQueues.clear();
  });

  it('activates an index version and updates activeIndexVersionId', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue({
      id: 'idx-row-1',
      documentId: 'doc-1',
      documentVersion: 3,
      indexVersion: 'idx-v3',
      status: 'building',
    });
    mocks.documentIndexVersionRepository.update.mockResolvedValue({
      id: 'idx-row-1',
      status: 'active',
    });
    mocks.documentRepository.publishBuild.mockResolvedValue(true);
    mocks.documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      activeIndexVersionId: 'idx-row-1',
      publishGeneration: 1,
    });

    const result = await documentIndexActivationService.activateVersion('idx-row-1');

    expect(mocks.documentIndexVersionRepository.supersedeActiveByDocumentId).toHaveBeenCalledWith(
      'doc-1',
      'idx-row-1',
      expect.anything()
    );
    expect(mocks.documentIndexVersionRepository.update).toHaveBeenCalledWith(
      'idx-row-1',
      expect.objectContaining({
        status: 'active',
        error: null,
      }),
      expect.anything()
    );
    expect(mocks.documentRepository.update).toHaveBeenCalledWith(
      'doc-1',
      { activeIndexVersionId: 'idx-row-1' },
      expect.anything()
    );
    expect(mocks.cacheService.invalidateDocumentCaches).toHaveBeenCalledWith('doc-1', 'idx-row-1');
    expect(mocks.cacheService.invalidateQueryCaches).toHaveBeenCalledWith({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
    });
    expect(result).toEqual({ id: 'idx-row-1', status: 'active' });
  });

  it('marks a version as failed and clears active pointer when needed', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue({
      id: 'idx-row-2',
      documentId: 'doc-1',
      documentVersion: 4,
      indexVersion: 'idx-v4',
      status: 'active',
    });
    mocks.documentIndexVersionRepository.update.mockResolvedValue({
      id: 'idx-row-2',
      status: 'failed',
    });
    mocks.documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      activeIndexVersionId: 'idx-row-2',
      publishGeneration: 1,
    });

    const result = await documentIndexActivationService.markFailed('idx-row-2', 'parse failed');

    expect(mocks.documentIndexVersionRepository.update).toHaveBeenCalledWith(
      'idx-row-2',
      {
        status: 'failed',
        error: 'parse failed',
      },
      expect.anything()
    );
    expect(mocks.documentRepository.update).toHaveBeenCalledWith(
      'doc-1',
      { activeIndexVersionId: null },
      expect.anything()
    );
    expect(mocks.cacheService.invalidateDocumentCaches).toHaveBeenCalledWith('doc-1', 'idx-row-2');
    expect(mocks.cacheService.invalidateQueryCaches).toHaveBeenCalledWith({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
    });
    expect(result).toEqual({ id: 'idx-row-2', status: 'failed' });
  });

  it('marks a version as superseded without touching unrelated active pointers', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue({
      id: 'idx-row-3',
      documentId: 'doc-1',
      documentVersion: 5,
      indexVersion: 'idx-v5',
      status: 'building',
    });
    mocks.documentIndexVersionRepository.update.mockResolvedValue({
      id: 'idx-row-3',
      status: 'superseded',
    });
    mocks.documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      activeIndexVersionId: 'idx-row-1',
      publishGeneration: 1,
    });

    const result = await documentIndexActivationService.markSuperseded('idx-row-3');

    expect(mocks.documentIndexVersionRepository.update).toHaveBeenCalledWith(
      'idx-row-3',
      {
        status: 'superseded',
      },
      expect.anything()
    );
    expect(mocks.documentRepository.update).not.toHaveBeenCalled();
    expect(mocks.cacheService.invalidateDocumentCaches).toHaveBeenCalledWith('doc-1', 'idx-row-3');
    expect(mocks.cacheService.invalidateQueryCaches).toHaveBeenCalledWith({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
    });
    expect(result).toEqual({ id: 'idx-row-3', status: 'superseded' });
  });

  it('rejects stale publish attempts without switching the active pointer', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue({
      id: 'idx-row-4',
      documentId: 'doc-1',
      documentVersion: 6,
      indexVersion: 'idx-v6',
      status: 'building',
    });
    mocks.documentIndexVersionRepository.update.mockResolvedValue({
      id: 'idx-row-4',
      status: 'superseded',
    });
    mocks.documentRepository.publishBuild.mockResolvedValue(false);

    const result = await documentIndexActivationService.activateVersion('idx-row-4', {
      expectedPublishGeneration: 2,
      chunkCount: 5,
      knowledgeBaseId: 'kb-1',
      chunkDelta: 5,
    });

    expect(mocks.documentIndexVersionRepository.supersedeActiveByDocumentId).not.toHaveBeenCalled();
    expect(mocks.knowledgeBaseService.incrementTotalChunks).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('publishes with fencing and chunk delta when generation matches', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue({
      id: 'idx-row-5',
      documentId: 'doc-1',
      documentVersion: 6,
      indexVersion: 'idx-v6',
      status: 'building',
    });
    mocks.documentIndexVersionRepository.update.mockResolvedValue({
      id: 'idx-row-5',
      status: 'active',
    });
    mocks.documentRepository.publishBuild.mockResolvedValue(true);
    mocks.documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      activeIndexVersionId: 'idx-row-5',
      publishGeneration: 2,
    });

    const result = await documentIndexActivationService.activateVersion('idx-row-5', {
      expectedPublishGeneration: 2,
      chunkCount: 7,
      knowledgeBaseId: 'kb-1',
      chunkDelta: 3,
    });

    expect(mocks.documentRepository.publishBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        activeIndexVersionId: 'idx-row-5',
        expectedPublishGeneration: 2,
        chunkCount: 7,
      })
    );
    expect(mocks.knowledgeBaseService.incrementTotalChunks).toHaveBeenCalledWith(
      'kb-1',
      3,
      expect.anything()
    );
    expect(result).toEqual({ id: 'idx-row-5', status: 'active' });
  });

  it('defers cache invalidation until the outer transaction commits', async () => {
    const outerTx = {};

    mocks.documentIndexVersionRepository.findById.mockResolvedValue({
      id: 'idx-row-6',
      documentId: 'doc-1',
      documentVersion: 7,
      indexVersion: 'idx-v7',
      status: 'active',
    });
    mocks.documentIndexVersionRepository.update.mockResolvedValue({
      id: 'idx-row-6',
      status: 'failed',
    });
    mocks.documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      activeIndexVersionId: 'idx-row-6',
      publishGeneration: 3,
    });

    const result = await documentIndexActivationService.markFailed(
      'idx-row-6',
      'parse failed',
      outerTx as never
    );

    expect(mocks.cacheService.invalidateDocumentCaches).not.toHaveBeenCalled();
    expect(mocks.cacheService.invalidateQueryCaches).not.toHaveBeenCalled();
    expect(mocks.afterTransactionCommit).toHaveBeenCalledWith(expect.any(Function), outerTx);

    await mocks.flushAfterCommitCallbacks(outerTx);

    expect(mocks.cacheService.invalidateDocumentCaches).toHaveBeenCalledWith('doc-1', 'idx-row-6');
    expect(mocks.cacheService.invalidateQueryCaches).toHaveBeenCalledWith({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
    });
    expect(result).toEqual({ id: 'idx-row-6', status: 'failed' });
  });

  it('throws not found when index version is missing', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue(undefined);

    await expect(documentIndexActivationService.activateVersion('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    } satisfies Partial<AppError>);
  });
});
