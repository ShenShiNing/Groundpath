import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repo: {
    searchActiveNodes: vi.fn(),
  },
}));

vi.mock('@modules/document-index/repositories/document-node-search.repository', () => ({
  documentNodeSearchRepository: mocks.repo,
}));

import { outlineSearchService } from '@modules/document-index/services/search/outline-search.service';

describe('outlineSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns scored node candidates and node citations', async () => {
    mocks.repo.searchActiveNodes.mockResolvedValue([
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
});
