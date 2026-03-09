import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  edgeRepo: {
    listByIndexVersionAndFromNodeIds: vi.fn(),
  },
  searchRepo: {
    getAccessibleNodesByIds: vi.fn(),
  },
  env: {
    agentConfig: {
      refFollowMaxDepth: 3,
      refFollowMaxNodes: 3,
    },
  },
}));

vi.mock('@modules/document-index/repositories/document-edge.repository', () => ({
  documentEdgeRepository: mocks.edgeRepo,
}));

vi.mock('@modules/document-index/repositories/document-node-search.repository', () => ({
  documentNodeSearchRepository: mocks.searchRepo,
}));

vi.mock('@config/env', () => mocks.env);

import { refFollowService } from '@modules/document-index/services/search/ref-follow.service';

describe('refFollowService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.edgeRepo.listByIndexVersionAndFromNodeIds.mockResolvedValue([]);
    mocks.env.agentConfig.refFollowMaxNodes = 3;
  });

  it('follows edges breadth-first and returns citations for discovered nodes', async () => {
    mocks.searchRepo.getAccessibleNodesByIds
      .mockResolvedValueOnce([
        {
          nodeId: 'node-1',
          documentId: 'doc-1',
          documentTitle: 'Guide',
          documentVersion: 1,
          indexVersion: 'idx-1',
          indexVersionId: 'row-1',
          nodeType: 'chapter',
          title: 'Root',
          depth: 1,
          sectionPath: ['Root'],
          pageStart: 1,
          pageEnd: 1,
          parentId: null,
          orderNo: 1,
          stableLocator: 'Root',
          content: null,
          contentPreview: 'Root preview',
          tokenCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          nodeId: 'node-2',
          documentId: 'doc-1',
          documentTitle: 'Guide',
          documentVersion: 1,
          indexVersion: 'idx-1',
          indexVersionId: 'row-1',
          nodeType: 'section',
          title: 'Appendix',
          depth: 2,
          sectionPath: ['Root', 'Appendix'],
          pageStart: 2,
          pageEnd: 3,
          parentId: 'node-1',
          orderNo: 2,
          stableLocator: 'Root > Appendix',
          content: null,
          contentPreview: 'Appendix preview',
          tokenCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          nodeId: 'node-3',
          documentId: 'doc-1',
          documentTitle: 'Guide',
          documentVersion: 1,
          indexVersion: 'idx-1',
          indexVersionId: 'row-1',
          nodeType: 'section',
          title: 'Details',
          depth: 2,
          sectionPath: ['Root', 'Details'],
          pageStart: 4,
          pageEnd: 4,
          parentId: 'node-2',
          orderNo: 3,
          stableLocator: 'Root > Details',
          content: null,
          contentPreview: 'Details preview',
          tokenCount: 1,
        },
      ]);

    mocks.edgeRepo.listByIndexVersionAndFromNodeIds
      .mockResolvedValueOnce([
        {
          id: 'edge-1',
          documentId: 'doc-1',
          indexVersionId: 'row-1',
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
          edgeType: 'refers_to',
          anchorText: 'Appendix',
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'edge-2',
          documentId: 'doc-1',
          indexVersionId: 'row-1',
          fromNodeId: 'node-2',
          toNodeId: 'node-3',
          edgeType: 'next',
          anchorText: null,
          createdAt: new Date(),
        },
      ]);

    const result = await refFollowService.follow({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      nodeId: 'node-1',
      edgeTypes: ['refers_to', 'next'],
    });

    expect(result.paths).toHaveLength(2);
    expect(result.paths[0]).toMatchObject({
      depth: 1,
      edgeType: 'refers_to',
      target: { nodeId: 'node-2', locator: 'Root > Appendix / p.2-3' },
    });
    expect(result.paths[1]).toMatchObject({
      depth: 2,
      edgeType: 'next',
      target: { nodeId: 'node-3', locator: 'Root > Details / p.4' },
    });
    expect(result.citations).toHaveLength(2);
    expect(result.maxDepthReached).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('marks traversal truncated when node cap is exceeded', async () => {
    mocks.env.agentConfig.refFollowMaxNodes = 1;
    mocks.searchRepo.getAccessibleNodesByIds
      .mockResolvedValueOnce([
        {
          nodeId: 'node-1',
          documentId: 'doc-1',
          documentTitle: 'Guide',
          documentVersion: 1,
          indexVersion: 'idx-1',
          indexVersionId: 'row-1',
          nodeType: 'chapter',
          title: 'Root',
          depth: 1,
          sectionPath: ['Root'],
          pageStart: 1,
          pageEnd: 1,
          parentId: null,
          orderNo: 1,
          stableLocator: 'Root',
          content: null,
          contentPreview: 'Root preview',
          tokenCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          nodeId: 'node-2',
          documentId: 'doc-1',
          documentTitle: 'Guide',
          documentVersion: 1,
          indexVersion: 'idx-1',
          indexVersionId: 'row-1',
          nodeType: 'section',
          title: 'Appendix',
          depth: 2,
          sectionPath: ['Root', 'Appendix'],
          pageStart: 2,
          pageEnd: 3,
          parentId: 'node-1',
          orderNo: 2,
          stableLocator: 'Root > Appendix',
          content: null,
          contentPreview: 'Appendix preview',
          tokenCount: 1,
        },
      ]);

    mocks.edgeRepo.listByIndexVersionAndFromNodeIds.mockResolvedValueOnce([
      {
        id: 'edge-1',
        documentId: 'doc-1',
        indexVersionId: 'row-1',
        fromNodeId: 'node-1',
        toNodeId: 'node-2',
        edgeType: 'parent',
        anchorText: null,
        createdAt: new Date(),
      },
      {
        id: 'edge-2',
        documentId: 'doc-1',
        indexVersionId: 'row-1',
        fromNodeId: 'node-1',
        toNodeId: 'node-3',
        edgeType: 'next',
        anchorText: null,
        createdAt: new Date(),
      },
    ]);

    const result = await refFollowService.follow({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      nodeId: 'node-1',
    });

    expect(result.truncated).toBe(true);
  });
});
