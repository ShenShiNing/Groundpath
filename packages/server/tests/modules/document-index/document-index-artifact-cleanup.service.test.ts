import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listCleanupCandidatesMock,
  deleteByIdMock,
  countByIndexVersionIdMock,
  getEmbeddingConfigMock,
  deleteByIndexVersionIdMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  listCleanupCandidatesMock: vi.fn(),
  deleteByIdMock: vi.fn(),
  countByIndexVersionIdMock: vi.fn(),
  getEmbeddingConfigMock: vi.fn(),
  deleteByIndexVersionIdMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@core/config/env', () => ({
  documentConfig: {
    buildCleanupRetentionDays: 7,
    buildCleanupBatchSize: 100,
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  }),
}));

vi.mock('@modules/document-index/repositories/document-index-version.repository', () => ({
  documentIndexVersionRepository: {
    listCleanupCandidates: listCleanupCandidatesMock,
    deleteById: deleteByIdMock,
  },
}));

vi.mock('@modules/document', () => ({
  documentChunkRepository: {
    countByIndexVersionId: countByIndexVersionIdMock,
  },
}));

vi.mock('@modules/knowledge-base', () => ({
  knowledgeBaseService: {
    getEmbeddingConfig: getEmbeddingConfigMock,
  },
}));

vi.mock('@modules/vector', () => ({
  vectorRepository: {
    deleteByIndexVersionId: deleteByIndexVersionIdMock,
  },
}));

import { documentIndexArtifactCleanupService } from '@modules/document-index/services/document-index-artifact-cleanup.service';

describe('document-index-artifact-cleanup.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmbeddingConfigMock.mockResolvedValue({ collectionName: 'collection-1' });
    countByIndexVersionIdMock.mockResolvedValue(3);
  });

  it('should delete superseded immutable build artifacts', async () => {
    listCleanupCandidatesMock.mockResolvedValue([
      {
        indexVersionId: 'idx-1',
        documentId: 'doc-1',
        documentVersion: 2,
        knowledgeBaseId: 'kb-1',
        status: 'superseded',
        builtAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    deleteByIndexVersionIdMock.mockResolvedValue(true);
    deleteByIdMock.mockResolvedValue(undefined);

    const result = await documentIndexArtifactCleanupService.cleanup(
      new Date('2026-03-11T00:00:00.000Z')
    );

    expect(deleteByIndexVersionIdMock).toHaveBeenCalledWith('collection-1', 'idx-1');
    expect(deleteByIdMock).toHaveBeenCalledWith('idx-1');
    expect(result.cleanedIndexVersionIds).toEqual(['idx-1']);
    expect(result.cleanedCount).toBe(1);
  });

  it('should skip deleting index version when vector soft delete fails', async () => {
    listCleanupCandidatesMock.mockResolvedValue([
      {
        indexVersionId: 'idx-2',
        documentId: 'doc-2',
        documentVersion: 3,
        knowledgeBaseId: 'kb-1',
        status: 'failed',
        builtAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    deleteByIndexVersionIdMock.mockResolvedValue(false);

    const result = await documentIndexArtifactCleanupService.cleanup(
      new Date('2026-03-11T00:00:00.000Z')
    );

    expect(deleteByIdMock).not.toHaveBeenCalled();
    expect(result.skippedIndexVersionIds).toEqual(['idx-2']);
    expect(result.skippedCount).toBe(1);
  });

  it('should continue when a cleanup candidate throws', async () => {
    listCleanupCandidatesMock.mockResolvedValue([
      {
        indexVersionId: 'idx-3',
        documentId: 'doc-3',
        documentVersion: 1,
        knowledgeBaseId: 'kb-1',
        status: 'superseded',
        builtAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        indexVersionId: 'idx-4',
        documentId: 'doc-4',
        documentVersion: 1,
        knowledgeBaseId: 'kb-1',
        status: 'failed',
        builtAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
    deleteByIndexVersionIdMock
      .mockRejectedValueOnce(new Error('qdrant failed'))
      .mockResolvedValueOnce(true);
    deleteByIdMock.mockResolvedValue(undefined);

    const result = await documentIndexArtifactCleanupService.cleanup(
      new Date('2026-03-11T00:00:00.000Z')
    );

    expect(result.failedIndexVersionIds).toEqual(['idx-3']);
    expect(result.cleanedIndexVersionIds).toEqual(['idx-4']);
    expect(result.failedCount).toBe(1);
    expect(result.cleanedCount).toBe(1);
  });
});
