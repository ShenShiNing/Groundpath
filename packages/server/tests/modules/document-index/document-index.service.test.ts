import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uuidV4: vi.fn(),
  withTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  documentIndexVersionRepository: {
    create: vi.fn(),
    update: vi.fn(),
  },
  documentNodeRepository: {
    createMany: vi.fn(),
    deleteByIndexVersionId: vi.fn(),
  },
  documentNodeContentRepository: {
    createMany: vi.fn(),
    deleteByIndexVersionId: vi.fn(),
  },
  documentEdgeRepository: {
    createMany: vi.fn(),
    deleteByIndexVersionId: vi.fn(),
  },
  documentIndexActivationService: {
    activateVersion: vi.fn(),
    markFailed: vi.fn(),
    markSuperseded: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: mocks.uuidV4,
}));

vi.mock('@shared/db/db.utils', () => ({
  withTransaction: mocks.withTransaction,
}));

vi.mock('@modules/document-index/repositories/document-index-version.repository', () => ({
  documentIndexVersionRepository: mocks.documentIndexVersionRepository,
}));

vi.mock('@modules/document-index/repositories/document-node.repository', () => ({
  documentNodeRepository: mocks.documentNodeRepository,
}));

vi.mock('@modules/document-index/repositories/document-node-content.repository', () => ({
  documentNodeContentRepository: mocks.documentNodeContentRepository,
}));

vi.mock('@modules/document-index/repositories/document-edge.repository', () => ({
  documentEdgeRepository: mocks.documentEdgeRepository,
}));

vi.mock('@modules/document-index/services/document-index-activation.service', () => ({
  documentIndexActivationService: mocks.documentIndexActivationService,
}));

import { documentIndexService } from '@modules/document-index/services/document-index.service';

describe('documentIndexService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uuidV4.mockReturnValueOnce('generated-index-version').mockReturnValueOnce('row-id');
  });

  it('starts an index build with generated ids when targetIndexVersion is absent', async () => {
    mocks.documentIndexVersionRepository.create.mockResolvedValue({ id: 'row-id' });

    const result = await documentIndexService.startBuild({
      documentId: 'doc-1',
      documentVersion: 2,
      routeMode: 'chunked',
      createdBy: 'user-1',
    });

    expect(mocks.documentIndexVersionRepository.create).toHaveBeenCalledWith({
      id: 'row-id',
      documentId: 'doc-1',
      documentVersion: 2,
      indexVersion: 'idx-generated-index-version',
      routeMode: 'chunked',
      status: 'building',
      workerJobId: null,
      createdBy: 'user-1',
    });
    expect(result).toEqual({ id: 'row-id' });
  });

  it('completes a build by updating metadata then activating it', async () => {
    mocks.documentIndexVersionRepository.update.mockResolvedValue(undefined);
    mocks.documentIndexActivationService.activateVersion.mockResolvedValue({ id: 'idx-row-1' });

    const result = await documentIndexService.completeBuild({
      indexVersionId: 'idx-row-1',
      parseMethod: 'chunked',
      parserRuntime: 'legacy-rag',
      headingCount: 0,
      parseDurationMs: 1234,
    });

    expect(mocks.documentIndexVersionRepository.update).toHaveBeenCalledWith('idx-row-1', {
      parseMethod: 'chunked',
      parserRuntime: 'legacy-rag',
      headingCount: 0,
      parseDurationMs: 1234,
      error: null,
    });
    expect(mocks.documentIndexActivationService.activateVersion).toHaveBeenCalledWith('idx-row-1', {
      expectedPublishGeneration: undefined,
      chunkCount: undefined,
      knowledgeBaseId: undefined,
      chunkDelta: undefined,
    });
    expect(result).toEqual({ id: 'idx-row-1' });
  });

  it('delegates failure and supersede transitions to activation service', async () => {
    await documentIndexService.failBuild('idx-row-2', 'boom');
    await documentIndexService.supersedeBuild('idx-row-3');

    expect(mocks.documentIndexActivationService.markFailed).toHaveBeenCalledWith(
      'idx-row-2',
      'boom'
    );
    expect(mocks.documentIndexActivationService.markSuperseded).toHaveBeenCalledWith('idx-row-3');
  });

  it('replaces graph data for an index version with generated persisted ids', async () => {
    mocks.uuidV4.mockReset();
    mocks.uuidV4
      .mockReturnValueOnce('persisted-root')
      .mockReturnValueOnce('persisted-node-1')
      .mockReturnValueOnce('persisted-edge-1')
      .mockReturnValueOnce('persisted-edge-2');

    const result = await documentIndexService.replaceGraph({
      documentId: 'doc-1',
      indexVersionId: 'idx-row-1',
      structure: {
        parseMethod: 'structured',
        parserRuntime: 'markdown',
        headingCount: 1,
        nodes: [
          {
            id: 'root',
            parentId: null,
            nodeType: 'document',
            title: null,
            depth: 0,
            sectionPath: [],
            orderNo: 0,
            stableLocator: 'Document',
            content: 'Intro',
            contentPreview: 'Intro',
            tokenCount: 1,
          },
          {
            id: 'node-1',
            parentId: 'root',
            nodeType: 'chapter',
            title: 'Chapter 1',
            depth: 1,
            sectionPath: ['Chapter 1'],
            orderNo: 1,
            stableLocator: 'Chapter 1',
            content: 'Body',
            contentPreview: 'Body',
            tokenCount: 1,
          },
        ],
        edges: [
          { fromNodeId: 'root', toNodeId: 'node-1', edgeType: 'parent' },
          { fromNodeId: 'root', toNodeId: 'node-1', edgeType: 'next' },
        ],
      },
    });

    expect(mocks.documentNodeRepository.deleteByIndexVersionId).toHaveBeenCalledWith(
      'idx-row-1',
      expect.anything()
    );
    expect(mocks.documentNodeRepository.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'persisted-root', parentId: null }),
        expect.objectContaining({ id: 'persisted-node-1', parentId: 'persisted-root' }),
      ]),
      expect.anything()
    );
    expect(mocks.documentNodeContentRepository.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'persisted-root', content: 'Intro' }),
        expect.objectContaining({ nodeId: 'persisted-node-1', content: 'Body' }),
      ]),
      expect.anything()
    );
    expect(mocks.documentEdgeRepository.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'persisted-edge-1',
          fromNodeId: 'persisted-root',
          toNodeId: 'persisted-node-1',
          edgeType: 'parent',
        }),
      ]),
      expect.anything()
    );
    expect(result).toEqual({ nodeCount: 2, edgeCount: 2 });
  });
});
