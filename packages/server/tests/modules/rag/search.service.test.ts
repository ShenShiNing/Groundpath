import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  knowledgeBaseServiceMock,
  ensureCollectionMock,
  getEmbeddingProviderByTypeMock,
  embeddingProviderMock,
  vectorRepositoryMock,
  documentRepositoryMock,
  loggerMock,
} = vi.hoisted(() => ({
  knowledgeBaseServiceMock: {
    getEmbeddingConfig: vi.fn(),
  },
  ensureCollectionMock: vi.fn(),
  getEmbeddingProviderByTypeMock: vi.fn(),
  embeddingProviderMock: {
    embed: vi.fn(),
  },
  vectorRepositoryMock: {
    search: vi.fn(),
  },
  documentRepositoryMock: {
    getActiveIndexVersionMap: vi.fn(),
  },
  loggerMock: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => loggerMock,
}));

vi.mock('@modules/knowledge-base/public/management', () => ({
  knowledgeBaseService: knowledgeBaseServiceMock,
}));

vi.mock('@modules/vector/public/qdrant', () => ({
  ensureCollection: ensureCollectionMock,
}));

vi.mock('@modules/vector/public/repositories', () => ({
  vectorRepository: vectorRepositoryMock,
}));

vi.mock('@modules/embedding', () => ({
  getEmbeddingProviderByType: getEmbeddingProviderByTypeMock,
}));

vi.mock('@modules/document/public/repositories', () => ({
  documentRepository: documentRepositoryMock,
}));

import { searchService } from '@modules/rag/services/search.service';

describe('searchService.searchInKnowledgeBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    knowledgeBaseServiceMock.getEmbeddingConfig.mockResolvedValue({
      provider: 'openai',
      dimensions: 1536,
      collectionName: 'collection-1',
    });
    ensureCollectionMock.mockResolvedValue(undefined);
    getEmbeddingProviderByTypeMock.mockReturnValue(embeddingProviderMock);
    embeddingProviderMock.embed.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it('should filter vector candidates to the active index version only', async () => {
    vectorRepositoryMock.search.mockResolvedValue([
      {
        id: 'v-old',
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        content: 'old build',
        score: 0.95,
        chunkIndex: 0,
        indexVersionId: 'idx-old',
      },
      {
        id: 'v-active',
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        content: 'active build',
        score: 0.91,
        chunkIndex: 0,
        indexVersionId: 'idx-active',
      },
    ]);
    documentRepositoryMock.getActiveIndexVersionMap.mockResolvedValue(
      new Map([['doc-1', 'idx-active']])
    );

    const results = await searchService.searchInKnowledgeBase({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'hello',
      limit: 2,
    });

    expect(vectorRepositoryMock.search).toHaveBeenCalledWith(
      'collection-1',
      [0.1, 0.2, 0.3],
      'user-1',
      expect.objectContaining({ limit: 10, knowledgeBaseId: 'kb-1' })
    );
    expect(results).toEqual([
      expect.objectContaining({
        id: 'v-active',
        indexVersionId: 'idx-active',
      }),
    ]);
  });

  it('should expand candidate fetch when the first batch is filtered out', async () => {
    const firstBatch = Array.from({ length: 10 }, (_, index) => ({
      id: `v-old-${index}`,
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      content: `old build ${index}`,
      score: 0.99 - index * 0.01,
      chunkIndex: index,
      indexVersionId: 'idx-old',
    }));

    vectorRepositoryMock.search.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce([
      ...firstBatch,
      {
        id: 'v-active',
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        content: 'active build',
        score: 0.9,
        chunkIndex: 1,
        indexVersionId: 'idx-active',
      },
    ]);
    documentRepositoryMock.getActiveIndexVersionMap.mockResolvedValue(
      new Map([['doc-1', 'idx-active']])
    );

    const results = await searchService.searchInKnowledgeBase({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'hello',
      limit: 2,
    });

    expect(vectorRepositoryMock.search).toHaveBeenCalledTimes(2);
    expect(vectorRepositoryMock.search.mock.calls[0]![3]).toEqual(
      expect.objectContaining({ limit: 10 })
    );
    expect(vectorRepositoryMock.search.mock.calls[1]![3]).toEqual(
      expect.objectContaining({ limit: 20 })
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.indexVersionId).toBe('idx-active');
  });
});
