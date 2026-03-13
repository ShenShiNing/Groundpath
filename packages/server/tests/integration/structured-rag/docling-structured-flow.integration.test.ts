import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  uuidCounter: 0,
  nodes: [] as Array<Record<string, unknown>>,
  contents: [] as Array<Record<string, unknown>>,
  edges: [] as Array<Record<string, unknown>>,
  resultCacheStore: new Map<string, unknown>(),
  previewStore: new Map<string, string>(),
  indexNodesCacheStore: new Map<string, unknown>(),
}));

vi.mock('uuid', () => ({
  v4: () => `generated-${++state.uuidCounter}`,
}));

vi.mock('@core/db/db.utils', () => ({
  withTransaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({}),
}));

vi.mock('@config/env', () => ({
  serverConfig: {
    nodeEnv: 'test',
  },
  loggingConfig: {
    level: 'silent',
  },
  agentConfig: {
    maxNodeReadTokens: 1200,
    refFollowMaxDepth: 3,
    refFollowMaxNodes: 20,
  },
  documentIndexConfig: {
    charsPerToken: 4,
    pdfTimeoutMs: 30000,
    pdfConcurrency: 1,
  },
  documentConfig: {
    maxSize: 22_020_096,
  },
  storageConfig: {
    type: 'local',
    localPath: './uploads',
    r2: {
      publicUrl: '',
    },
    signing: {
      avatarUrlExpiresIn: 604800,
    },
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@modules/document/services/document-storage.service', () => ({
  documentStorageService: {
    getDocumentContent: vi.fn(),
  },
}));

vi.mock('@modules/document-index/repositories/document-index-version.repository', () => ({
  documentIndexVersionRepository: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@modules/document-index/services/document-index-activation.service', () => ({
  documentIndexActivationService: {
    activateVersion: vi.fn(),
    markFailed: vi.fn(),
    markSuperseded: vi.fn(),
  },
}));

vi.mock('@modules/document-index/repositories/document-node.repository', () => ({
  documentNodeRepository: {
    createMany: vi.fn(async (data: Array<Record<string, unknown>>) => {
      state.nodes = [...data];
    }),
    deleteByIndexVersionId: vi.fn(async () => {
      state.nodes = [];
    }),
    listByIndexVersionId: vi.fn(async (indexVersionId: string) =>
      state.nodes
        .filter((node) => node.indexVersionId === indexVersionId)
        .sort((a, b) => Number(a.orderNo) - Number(b.orderNo))
    ),
  },
}));

vi.mock('@modules/document-index/repositories/document-node-content.repository', () => ({
  documentNodeContentRepository: {
    createMany: vi.fn(async (data: Array<Record<string, unknown>>) => {
      state.contents = [...data];
    }),
    deleteByIndexVersionId: vi.fn(async () => {
      state.contents = [];
    }),
  },
}));

function buildAccessibleRows(nodeIds?: string[]) {
  const filteredNodes = state.nodes.filter((node) =>
    nodeIds ? nodeIds.includes(String(node.id)) : true
  );

  return filteredNodes.map((node) => {
    const contentRow = state.contents.find((content) => content.nodeId === node.id);
    return {
      nodeId: node.id,
      documentId: 'doc-1',
      documentTitle: 'Fixture Guide',
      documentVersion: 1,
      indexVersion: 'idx-1',
      indexVersionId: 'idx-row-1',
      nodeType: node.nodeType,
      title: node.title,
      depth: node.depth,
      sectionPath: node.sectionPath,
      pageStart: node.pageStart ?? null,
      pageEnd: node.pageEnd ?? null,
      parentId: node.parentId ?? null,
      orderNo: node.orderNo,
      stableLocator: node.stableLocator ?? null,
      content: contentRow?.content ?? null,
      contentPreview: contentRow?.contentPreview ?? null,
      tokenCount: contentRow?.tokenCount ?? node.tokenCount ?? null,
    };
  });
}

vi.mock('@modules/document-index/repositories/document-edge.repository', () => ({
  documentEdgeRepository: {
    createMany: vi.fn(async (data: Array<Record<string, unknown>>) => {
      state.edges = [...data];
    }),
    deleteByIndexVersionId: vi.fn(async () => {
      state.edges = [];
    }),
    listByIndexVersionAndFromNodeIds: vi.fn(
      async (indexVersionId: string, fromNodeIds: string[], edgeTypes?: string[]) =>
        state.edges.filter(
          (edge) =>
            edge.indexVersionId === indexVersionId &&
            fromNodeIds.includes(String(edge.fromNodeId)) &&
            (!edgeTypes || edgeTypes.includes(String(edge.edgeType)))
        )
    ),
  },
}));

vi.mock('@modules/document-index/repositories/document-node-search.repository', () => ({
  documentNodeSearchRepository: {
    searchActiveNodeHeads: vi.fn(async () =>
      buildAccessibleRows()
        .filter((row) => row.nodeType !== 'document')
        .map((row) => ({ ...row, content: null }))
    ),
    getContentPreviewsByNodeIds: vi.fn(async (nodeIds: string[]) => {
      return new Map(
        buildAccessibleRows(nodeIds)
          .filter((row) => typeof row.contentPreview === 'string')
          .map((row) => [row.nodeId, row.contentPreview as string])
      );
    }),
    getAccessibleNodesByIds: vi.fn(async (input: { nodeIds: string[] }) =>
      buildAccessibleRows(input.nodeIds)
    ),
  },
}));

vi.mock('@modules/document-index/services/document-index-cache.service', () => ({
  documentIndexCacheService: {
    getOutlineSearch: vi.fn(async (_input: unknown, factory: () => Promise<unknown>) => factory()),
    getNodeReadResult: vi.fn(async (_input: unknown, factory: () => Promise<unknown>) => factory()),
    getNodeReadItem: vi.fn(async (_input: unknown, factory: () => Promise<unknown>) => factory()),
    getIndexVersionNodes: vi.fn(async (_indexVersionId: string, factory: () => Promise<unknown>) =>
      factory()
    ),
    getNodePreview: vi.fn(
      async (documentId: string, nodeId: string) =>
        state.previewStore.get(`${documentId}:${nodeId}`) ?? null
    ),
    setNodePreview: vi.fn(async (documentId: string, nodeId: string, preview: string) => {
      state.previewStore.set(`${documentId}:${nodeId}`, preview);
    }),
  },
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, '../../fixtures/document-index/docling');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf-8');
}

describe('docling structured flow integration', () => {
  beforeEach(() => {
    state.uuidCounter = 0;
    state.nodes = [];
    state.contents = [];
    state.edges = [];
    state.resultCacheStore.clear();
    state.previewStore.clear();
    state.indexNodesCacheStore.clear();
  });

  it('parses book fixture, persists graph, and downweights front matter during outline search', async () => {
    const { pdfStructureParser } =
      await import('@modules/document-index/services/parsers/pdf-structure.parser');
    const { documentIndexService } =
      await import('@modules/document-index/services/document-index.service');
    const { outlineSearchService } =
      await import('@modules/document-index/services/search/outline-search.service');

    const structure = pdfStructureParser.parseDoclingMarkdown(readFixture('book-nist-snippet.md'));
    await documentIndexService.replaceGraph({
      documentId: 'doc-1',
      indexVersionId: 'idx-row-1',
      structure,
    });

    const result = await outlineSearchService.search({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'introduction',
      includeContentPreview: true,
    });

    expect(result.results[0]).toMatchObject({
      title: '1. Introduction',
    });
    expect(result.results[0]?.sectionPath?.[0]).not.toBe('Front Matter');
  });

  it('parses synthetic fixture and lets figure/table/appendix nodes be searched, read, and followed', async () => {
    const { pdfStructureParser } =
      await import('@modules/document-index/services/parsers/pdf-structure.parser');
    const { documentIndexService } =
      await import('@modules/document-index/services/document-index.service');
    const { outlineSearchService } =
      await import('@modules/document-index/services/search/outline-search.service');
    const { nodeReadService } =
      await import('@modules/document-index/services/search/node-read.service');
    const { refFollowService } =
      await import('@modules/document-index/services/search/ref-follow.service');

    const structure = pdfStructureParser.parseDoclingMarkdown(
      readFixture('synthetic-chart-snippet.md')
    );
    await documentIndexService.replaceGraph({
      documentId: 'doc-1',
      indexVersionId: 'idx-row-1',
      structure,
    });

    const figureSearch = await outlineSearchService.search({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'figure 2-1',
    });
    expect(figureSearch.results[0]).toMatchObject({
      title: 'Figure 2-1. Regional demand index',
    });

    const persistedTableNode = buildAccessibleRows().find((row) => row.nodeType === 'table');
    expect(persistedTableNode).toBeTruthy();

    const tableRead = await nodeReadService.read({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      nodeIds: [String(persistedTableNode?.nodeId)],
    });
    expect(tableRead.citations[0]).toMatchObject({
      excerpt: 'Table 1: Metric | Baseline | Scenario A | Scenario B',
    });

    const keyFindingNode = buildAccessibleRows().find((row) => row.title === '1. Key findings');
    expect(keyFindingNode).toBeTruthy();

    const follow = await refFollowService.follow({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      nodeId: String(keyFindingNode?.nodeId),
      edgeTypes: ['refers_to', 'cites'],
    });

    expect(follow.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          excerpt: 'Appendix A. Data assumptions for Table 3-1.',
        }),
      ])
    );
  });
});
