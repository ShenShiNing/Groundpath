import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repo: {
    searchActiveNodeHeads: vi.fn(),
    getContentPreviewsByNodeIds: vi.fn(),
  },
  cacheStore: new Map<string, unknown>(),
  previewStore: new Map<string, string>(),
}));

vi.mock('@modules/document-index/repositories/document-node-search.repository', () => ({
  documentNodeSearchRepository: mocks.repo,
}));

vi.mock('@modules/document-index/services/document-index-cache.service', () => ({
  documentIndexCacheService: {
    getOutlineSearch: vi.fn(async (input: Record<string, unknown>, factory: () => Promise<unknown>) => {
      const key = JSON.stringify(input);
      if (mocks.cacheStore.has(key)) {
        return mocks.cacheStore.get(key);
      }
      const value = await factory();
      mocks.cacheStore.set(key, value);
      return value;
    }),
    getNodePreview: vi.fn(async (documentId: string, nodeId: string) => {
      return mocks.previewStore.get(`${documentId}:${nodeId}`) ?? null;
    }),
    setNodePreview: vi.fn(async (documentId: string, nodeId: string, preview: string) => {
      mocks.previewStore.set(`${documentId}:${nodeId}`, preview);
    }),
  },
}));

import { outlineSearchService } from '@modules/document-index/services/search/outline-search.service';

describe('outlineSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheStore.clear();
    mocks.previewStore.clear();
  });

  it('returns scored node candidates and node citations', async () => {
    mocks.repo.searchActiveNodeHeads.mockResolvedValue([
      {
        nodeId: 'node-1',
        documentId: 'doc-1',
        documentTitle: 'Architecture Guide',
        documentVersion: 2,
        indexVersion: 'idx-1',
        indexVersionId: 'row-1',
        nodeType: 'chapter',
        title: 'Retrieval Pipeline',
        depth: 1,
        sectionPath: ['Retrieval Pipeline'],
        pageStart: 12,
        pageEnd: 14,
        parentId: 'root',
        orderNo: 1,
        stableLocator: 'Retrieval Pipeline',
        content: null,
        contentPreview: 'This section explains retrieval planning.',
        tokenCount: 12,
      },
    ]);
    mocks.repo.getContentPreviewsByNodeIds.mockResolvedValue(
      new Map([['node-1', 'This section explains retrieval planning.']])
    );

    const result = await outlineSearchService.search({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'retrieval',
      includeContentPreview: true,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      nodeId: 'node-1',
      locator: 'Retrieval Pipeline / p.12-14',
      matchReason: 'title',
    });
    expect(result.citations[0]).toMatchObject({
      sourceType: 'node',
      nodeId: 'node-1',
      documentId: 'doc-1',
      locator: 'Retrieval Pipeline / p.12-14',
    });
  });

  it('prefers alias-style matches such as numbered sections and appendices', async () => {
    mocks.repo.searchActiveNodeHeads.mockResolvedValue([
      {
        nodeId: 'node-2',
        documentId: 'doc-1',
        documentTitle: 'Architecture Guide',
        documentVersion: 2,
        indexVersion: 'idx-1',
        indexVersionId: 'row-1',
        nodeType: 'section',
        title: '1.1 Goals',
        depth: 2,
        sectionPath: ['Chapter 1 Introduction', '1.1 Goals'],
        pageStart: 15,
        pageEnd: 15,
        parentId: 'node-1',
        orderNo: 2,
        stableLocator: 'Chapter 1 Introduction > 1.1 Goals',
        content: null,
        contentPreview: 'Goal text',
        tokenCount: 8,
      },
      {
        nodeId: 'node-3',
        documentId: 'doc-1',
        documentTitle: 'Architecture Guide',
        documentVersion: 2,
        indexVersion: 'idx-1',
        indexVersionId: 'row-1',
        nodeType: 'appendix',
        title: 'Appendix B Extra Tables',
        depth: 1,
        sectionPath: ['Appendix B Extra Tables'],
        pageStart: 30,
        pageEnd: 31,
        parentId: 'root',
        orderNo: 3,
        stableLocator: 'Appendix B Extra Tables',
        content: null,
        contentPreview: 'Extra tables',
        tokenCount: 6,
      },
    ]);
    mocks.repo.getContentPreviewsByNodeIds.mockResolvedValue(new Map());

    const numbered = await outlineSearchService.search({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: '1.1',
    });
    expect(numbered.results[0]).toMatchObject({
      nodeId: 'node-2',
      matchReason: 'alias',
    });

    const appendix = await outlineSearchService.search({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'appendix b',
    });
    expect(appendix.results[0]).toMatchObject({
      nodeId: 'node-3',
      matchReason: 'alias',
    });
  });

  it('reuses cached outline search results for repeated identical queries', async () => {
    mocks.repo.searchActiveNodeHeads.mockResolvedValue([
      {
        nodeId: 'node-1',
        documentId: 'doc-1',
        documentTitle: 'Architecture Guide',
        documentVersion: 2,
        indexVersion: 'idx-1',
        indexVersionId: 'row-1',
        nodeType: 'chapter',
        title: 'Retrieval Pipeline',
        depth: 1,
        sectionPath: ['Retrieval Pipeline'],
        pageStart: 12,
        pageEnd: 14,
        parentId: 'root',
        orderNo: 1,
        stableLocator: 'Retrieval Pipeline',
        content: null,
        contentPreview: 'This section explains retrieval planning.',
        tokenCount: 12,
      },
    ]);
    mocks.repo.getContentPreviewsByNodeIds.mockResolvedValue(
      new Map([['node-1', 'This section explains retrieval planning.']])
    );

    await outlineSearchService.search({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'retrieval',
      includeContentPreview: true,
    });
    await outlineSearchService.search({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'retrieval',
      includeContentPreview: true,
    });

    expect(mocks.repo.searchActiveNodeHeads).toHaveBeenCalledTimes(1);
  });
});
