import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchRepo: {
    getAccessibleNodesByIds: vi.fn(),
  },
  nodeRepo: {
    listByIndexVersionId: vi.fn(),
  },
  resultCacheStore: new Map<string, unknown>(),
  indexNodesCacheStore: new Map<string, unknown>(),
  env: {
    agentConfig: { maxNodeReadTokens: 5 },
    documentIndexConfig: { charsPerToken: 4 },
  },
}));

vi.mock('@modules/document-index/repositories/document-node-search.repository', () => ({
  documentNodeSearchRepository: mocks.searchRepo,
}));

vi.mock('@modules/document-index/repositories/document-node.repository', () => ({
  documentNodeRepository: mocks.nodeRepo,
}));

vi.mock('@modules/document-index/services/document-index-cache.service', () => ({
  documentIndexCacheService: {
    getNodeReadResult: vi.fn(async (input: Record<string, unknown>, factory: () => Promise<unknown>) => {
      const key = JSON.stringify(input);
      if (mocks.resultCacheStore.has(key)) {
        return mocks.resultCacheStore.get(key);
      }
      const value = await factory();
      mocks.resultCacheStore.set(key, value);
      return value;
    }),
    getNodeReadItem: vi.fn(async (input: Record<string, unknown>, factory: () => Promise<unknown>) => {
      const key = JSON.stringify(input);
      if (mocks.resultCacheStore.has(key)) {
        return mocks.resultCacheStore.get(key);
      }
      const value = await factory();
      mocks.resultCacheStore.set(key, value);
      return value;
    }),
    getIndexVersionNodes: vi.fn(async (indexVersionId: string, factory: () => Promise<unknown>) => {
      if (mocks.indexNodesCacheStore.has(indexVersionId)) {
        return mocks.indexNodesCacheStore.get(indexVersionId);
      }
      const value = await factory();
      mocks.indexNodesCacheStore.set(indexVersionId, value);
      return value;
    }),
  },
}));

vi.mock('@config/env', () => mocks.env);

import { nodeReadService } from '@modules/document-index/services/search/node-read.service';

describe('nodeReadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resultCacheStore.clear();
    mocks.indexNodesCacheStore.clear();
  });

  it('returns truncated node content with parent/prev/next references', async () => {
    mocks.searchRepo.getAccessibleNodesByIds.mockResolvedValue([
      {
        nodeId: 'node-2',
        documentId: 'doc-1',
        documentTitle: 'Architecture Guide',
        documentVersion: 2,
        indexVersion: 'idx-1',
        indexVersionId: 'row-1',
        nodeType: 'section',
        title: 'Planning',
        depth: 2,
        sectionPath: ['Retrieval', 'Planning'],
        pageStart: 14,
        pageEnd: 14,
        parentId: 'node-1',
        orderNo: 2,
        stableLocator: 'Retrieval > Planning',
        content: 'This is a long body that should be truncated for the test.',
        contentPreview: 'This is a long body',
        tokenCount: 20,
      },
    ]);
    mocks.nodeRepo.listByIndexVersionId.mockResolvedValue([
      {
        id: 'node-1',
        documentId: 'doc-1',
        indexVersionId: 'row-1',
        nodeType: 'chapter',
        title: 'Retrieval',
        depth: 1,
        sectionPath: ['Retrieval'],
        pageStart: 12,
        pageEnd: 13,
        parentId: 'root',
        orderNo: 1,
        tokenCount: 10,
        stableLocator: 'Retrieval',
        createdAt: new Date(),
      },
      {
        id: 'node-2',
        documentId: 'doc-1',
        indexVersionId: 'row-1',
        nodeType: 'section',
        title: 'Planning',
        depth: 2,
        sectionPath: ['Retrieval', 'Planning'],
        pageStart: 14,
        pageEnd: 14,
        parentId: 'node-1',
        orderNo: 2,
        tokenCount: 20,
        stableLocator: 'Retrieval > Planning',
        createdAt: new Date(),
      },
      {
        id: 'node-3',
        documentId: 'doc-1',
        indexVersionId: 'row-1',
        nodeType: 'section',
        title: 'Execution',
        depth: 2,
        sectionPath: ['Retrieval', 'Execution'],
        pageStart: 15,
        pageEnd: 16,
        parentId: 'node-1',
        orderNo: 3,
        tokenCount: 20,
        stableLocator: 'Retrieval > Execution',
        createdAt: new Date(),
      },
    ]);

    const result = await nodeReadService.read({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      nodeIds: ['node-2'],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      nodeId: 'node-2',
      truncated: true,
      parent: { nodeId: 'node-1', title: 'Retrieval' },
      prev: { nodeId: 'node-1', title: 'Retrieval' },
      next: { nodeId: 'node-3', title: 'Execution' },
    });
    expect(result.citations[0]).toMatchObject({
      sourceType: 'node',
      nodeId: 'node-2',
      documentId: 'doc-1',
    });
  });

  it('reuses cached node_read results for repeated identical requests', async () => {
    mocks.searchRepo.getAccessibleNodesByIds.mockResolvedValue([
      {
        nodeId: 'node-2',
        documentId: 'doc-1',
        documentTitle: 'Architecture Guide',
        documentVersion: 2,
        indexVersion: 'idx-1',
        indexVersionId: 'row-1',
        nodeType: 'section',
        title: 'Planning',
        depth: 2,
        sectionPath: ['Retrieval', 'Planning'],
        pageStart: 14,
        pageEnd: 14,
        parentId: 'node-1',
        orderNo: 2,
        stableLocator: 'Retrieval > Planning',
        content: 'This is a long body that should be truncated for the test.',
        contentPreview: 'This is a long body',
        tokenCount: 20,
      },
    ]);
    mocks.nodeRepo.listByIndexVersionId.mockResolvedValue([
      {
        id: 'node-1',
        documentId: 'doc-1',
        indexVersionId: 'row-1',
        nodeType: 'chapter',
        title: 'Retrieval',
        depth: 1,
        sectionPath: ['Retrieval'],
        pageStart: 12,
        pageEnd: 13,
        parentId: 'root',
        orderNo: 1,
        tokenCount: 10,
        stableLocator: 'Retrieval',
        createdAt: new Date(),
      },
      {
        id: 'node-2',
        documentId: 'doc-1',
        indexVersionId: 'row-1',
        nodeType: 'section',
        title: 'Planning',
        depth: 2,
        sectionPath: ['Retrieval', 'Planning'],
        pageStart: 14,
        pageEnd: 14,
        parentId: 'node-1',
        orderNo: 2,
        tokenCount: 20,
        stableLocator: 'Retrieval > Planning',
        createdAt: new Date(),
      },
    ]);

    await nodeReadService.read({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      nodeIds: ['node-2'],
    });
    await nodeReadService.read({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      nodeIds: ['node-2'],
    });

    expect(mocks.searchRepo.getAccessibleNodesByIds).toHaveBeenCalledTimes(1);
    expect(mocks.nodeRepo.listByIndexVersionId).toHaveBeenCalledTimes(1);
  });
});
