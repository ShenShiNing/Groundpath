import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock logger ───
const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => loggerMock,
}));

// ─── Mock dependencies ───
const {
  documentRepositoryMock,
  documentVersionRepositoryMock,
  documentChunkRepositoryMock,
  knowledgeBaseServiceMock,
  vectorRepositoryMock,
  embeddingProviderMock,
  chunkingServiceMock,
  ensureCollectionMock,
  getEmbeddingProviderByTypeMock,
  dbMock,
  withTransactionMock,
  documentParseRouterServiceMock,
  documentIndexServiceMock,
  markdownStructureParserMock,
  docxStructureParserMock,
  pdfStructureParserMock,
} = vi.hoisted(() => ({
  documentRepositoryMock: {
    findById: vi.fn(),
    updateProcessingStatus: vi.fn(),
  },
  documentVersionRepositoryMock: {
    findByDocumentAndVersion: vi.fn(),
  },
  documentChunkRepositoryMock: {
    getChunkIdsByDocumentId: vi.fn(),
    createMany: vi.fn(),
    deleteByIds: vi.fn(),
    deleteByDocumentId: vi.fn(),
  },
  knowledgeBaseServiceMock: {
    getEmbeddingConfig: vi.fn(),
    incrementTotalChunks: vi.fn(),
  },
  vectorRepositoryMock: {
    upsert: vi.fn(),
    deleteByDocumentId: vi.fn(),
    deleteByIds: vi.fn(),
  },
  embeddingProviderMock: {
    embedBatch: vi.fn(),
    getName: vi.fn(() => 'mock/embed'),
  },
  chunkingServiceMock: {
    chunkText: vi.fn(),
  },
  ensureCollectionMock: vi.fn(),
  getEmbeddingProviderByTypeMock: vi.fn(),
  dbMock: {
    update: vi.fn(),
  },
  withTransactionMock: vi.fn(),
  documentParseRouterServiceMock: {
    decideRoute: vi.fn(),
  },
  documentIndexServiceMock: {
    startBuild: vi.fn(),
    completeBuild: vi.fn(),
    failBuild: vi.fn(),
    supersedeBuild: vi.fn(),
    replaceGraph: vi.fn(),
  },
  markdownStructureParserMock: {
    parse: vi.fn(),
  },
  docxStructureParserMock: {
    parseFromStorage: vi.fn(),
  },
  pdfStructureParserMock: {
    parseFromStorage: vi.fn(),
    parseFromStorageWithImages: vi.fn(),
  },
}));

vi.mock('@modules/document', () => ({
  documentRepository: documentRepositoryMock,
  documentVersionRepository: documentVersionRepositoryMock,
  documentChunkRepository: documentChunkRepositoryMock,
}));

vi.mock('@modules/knowledge-base', () => ({
  knowledgeBaseService: knowledgeBaseServiceMock,
}));

vi.mock('@modules/vector', () => ({
  vectorRepository: vectorRepositoryMock,
  ensureCollection: ensureCollectionMock,
}));

vi.mock('@modules/embedding', () => ({
  getEmbeddingProviderByType: getEmbeddingProviderByTypeMock,
}));

vi.mock('@modules/rag/services/chunking.service', () => ({
  chunkingService: chunkingServiceMock,
}));

vi.mock('@modules/document-index/services/document-parse-router.service', () => ({
  documentParseRouterService: documentParseRouterServiceMock,
}));

vi.mock('@modules/document-index/services/document-index.service', () => ({
  documentIndexService: documentIndexServiceMock,
}));

vi.mock('@modules/document-index/services/parsers/markdown-structure.parser', () => ({
  markdownStructureParser: markdownStructureParserMock,
}));

vi.mock('@modules/document-index/services/parsers/docx-structure.parser', () => ({
  docxStructureParser: docxStructureParserMock,
}));

vi.mock('@modules/document-index/services/parsers/pdf-structure.parser', () => ({
  pdfStructureParser: pdfStructureParserMock,
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2, 8)),
}));

vi.mock('@shared/db/db.utils', () => ({
  withTransaction: withTransactionMock,
}));

vi.mock('@shared/db', () => ({
  db: dbMock,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock('@shared/db/schema/document/documents.schema', () => ({
  documents: {
    id: 'id',
    processingStatus: 'processingStatus',
    processingError: 'processingError',
  },
}));

import { processingService } from '@modules/rag/services/processing.service';

describe('RAG Processing Error Injection', () => {
  const docId = 'doc-123';
  const userId = 'user-1';
  const kbId = 'kb-1';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock setup: acquireProcessingLock succeeds
    const updateSetMock = {
      where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    };
    const updateMock = {
      set: vi.fn().mockReturnValue(updateSetMock),
    };
    dbMock.update.mockReturnValue(updateMock);

    // Default document found
    documentRepositoryMock.findById.mockResolvedValue({
      id: docId,
      knowledgeBaseId: kbId,
      chunkCount: 0,
      currentVersion: 1,
    });

    // Default KB embedding config
    knowledgeBaseServiceMock.getEmbeddingConfig.mockResolvedValue({
      provider: 'openai',
      dimensions: 1536,
      collectionName: 'col-1',
    });

    ensureCollectionMock.mockResolvedValue(undefined);
    documentChunkRepositoryMock.getChunkIdsByDocumentId.mockResolvedValue([]);
    getEmbeddingProviderByTypeMock.mockReturnValue(embeddingProviderMock);
    documentParseRouterServiceMock.decideRoute.mockReturnValue({
      routeMode: 'chunked',
      reason: 'below_threshold',
      estimatedTokens: 100,
      thresholdTokens: 5000,
      structuredCandidate: true,
      rolloutMode: 'disabled',
    });
    documentIndexServiceMock.startBuild.mockResolvedValue({ id: 'idx-build-1' });
    documentIndexServiceMock.completeBuild.mockResolvedValue(undefined);
    documentIndexServiceMock.failBuild.mockResolvedValue(undefined);
    documentIndexServiceMock.supersedeBuild.mockResolvedValue(undefined);
    documentIndexServiceMock.replaceGraph.mockResolvedValue(undefined);
    markdownStructureParserMock.parse.mockReturnValue({
      nodes: [],
      edges: [],
      parseMethod: 'structured',
      parserRuntime: 'markdown',
      headingCount: 0,
    });
    docxStructureParserMock.parseFromStorage.mockResolvedValue({
      nodes: [],
      edges: [],
      parseMethod: 'structured',
      parserRuntime: 'docx',
      headingCount: 0,
    });
    pdfStructureParserMock.parseFromStorage.mockResolvedValue({
      nodes: [],
      edges: [],
      parseMethod: 'structured',
      parserRuntime: 'pdf',
      headingCount: 0,
    });
    pdfStructureParserMock.parseFromStorageWithImages.mockResolvedValue({
      nodes: [],
      edges: [],
      parseMethod: 'structured',
      parserRuntime: 'pdf',
      headingCount: 0,
    });
  });

  it('should mark as failed and release lock when embedding fails', async () => {
    documentVersionRepositoryMock.findByDocumentAndVersion.mockResolvedValue({
      textContent: 'Some text content for embedding',
    });
    chunkingServiceMock.chunkText.mockReturnValue([
      { chunkIndex: 0, content: 'Some text', metadata: { startOffset: 0, endOffset: 9 } },
    ]);
    embeddingProviderMock.embedBatch.mockRejectedValue(new Error('Embedding API timeout'));

    await processingService.processDocument(docId, userId);

    // Should mark as failed
    expect(documentRepositoryMock.updateProcessingStatus).toHaveBeenCalledWith(
      docId,
      'failed',
      expect.stringContaining('Embedding API timeout')
    );
  });

  it('should mark as failed when Qdrant upsert fails', async () => {
    documentVersionRepositoryMock.findByDocumentAndVersion.mockResolvedValue({
      textContent: 'Some text',
    });
    chunkingServiceMock.chunkText.mockReturnValue([
      { chunkIndex: 0, content: 'chunk', metadata: { startOffset: 0, endOffset: 5 } },
    ]);
    embeddingProviderMock.embedBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);
    vectorRepositoryMock.upsert.mockRejectedValue(new Error('Qdrant connection refused'));

    await processingService.processDocument(docId, userId);

    expect(documentRepositoryMock.updateProcessingStatus).toHaveBeenCalledWith(
      docId,
      'failed',
      'Vector storage failed - please retry processing'
    );
  });

  it('should complete when old vector cleanup fails (best-effort)', async () => {
    documentVersionRepositoryMock.findByDocumentAndVersion.mockResolvedValue({
      textContent: 'Some text',
    });
    chunkingServiceMock.chunkText.mockReturnValue([
      { chunkIndex: 0, content: 'chunk', metadata: { startOffset: 0, endOffset: 5 } },
    ]);
    embeddingProviderMock.embedBatch.mockResolvedValue([[0.1, 0.2]]);
    vectorRepositoryMock.upsert.mockResolvedValue(undefined);

    // Has old chunks to clean up
    documentChunkRepositoryMock.getChunkIdsByDocumentId.mockResolvedValue(['old-1', 'old-2']);

    // Transaction succeeds
    withTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb({}));
    documentChunkRepositoryMock.createMany.mockResolvedValue(undefined);
    documentChunkRepositoryMock.deleteByIds.mockResolvedValue(undefined);
    documentRepositoryMock.updateProcessingStatus.mockResolvedValue(undefined);

    // Old vector cleanup fails
    vectorRepositoryMock.deleteByIds.mockRejectedValue(new Error('Cleanup failed'));

    await processingService.processDocument(docId, userId);

    // Should log warning but not fail
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: docId }),
      expect.stringContaining('Failed to delete old vectors')
    );
    // Should still log completion
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: docId, chunkCount: 1 }),
      'Document processing completed'
    );
  });

  it('should skip processing when lock is already held', async () => {
    // Simulate lock already held by returning affectedRows: 0
    const updateSetMock = {
      where: vi.fn().mockResolvedValue([{ affectedRows: 0 }]),
    };
    const updateMock = {
      set: vi.fn().mockReturnValue(updateSetMock),
    };
    dbMock.update.mockReturnValue(updateMock);

    await processingService.processDocument(docId, userId);

    // Should not attempt to find document
    expect(documentRepositoryMock.findById).not.toHaveBeenCalled();
  });

  it('should reset to pending and skip stale target versions', async () => {
    documentRepositoryMock.findById.mockResolvedValue({
      id: docId,
      knowledgeBaseId: kbId,
      chunkCount: 0,
      currentVersion: 2,
    });
    documentRepositoryMock.updateProcessingStatus.mockResolvedValue(undefined);

    await processingService.processDocument(docId, userId, {
      targetDocumentVersion: 1,
      reason: 'edit',
    });

    expect(documentRepositoryMock.updateProcessingStatus).toHaveBeenCalledWith(
      docId,
      'pending',
      null
    );
    expect(documentVersionRepositoryMock.findByDocumentAndVersion).not.toHaveBeenCalled();
    expect(chunkingServiceMock.chunkText).not.toHaveBeenCalled();
    expect(documentIndexServiceMock.startBuild).not.toHaveBeenCalled();
  });

  it('should continue with chunk fallback when markdown structured parsing fails', async () => {
    documentRepositoryMock.findById.mockResolvedValue({
      id: docId,
      knowledgeBaseId: kbId,
      chunkCount: 0,
      currentVersion: 1,
      documentType: 'markdown',
    });
    documentVersionRepositoryMock.findByDocumentAndVersion.mockResolvedValue({
      textContent: 'Some long text',
    });
    documentIndexServiceMock.startBuild.mockResolvedValue({ id: 'idx-build-1' });
    documentParseRouterServiceMock.decideRoute.mockReturnValue({
      routeMode: 'structured',
      reason: 'meets_threshold',
      estimatedTokens: 6000,
      thresholdTokens: 5000,
      structuredCandidate: true,
      rolloutMode: 'all',
    });
    markdownStructureParserMock.parse.mockImplementation(() => {
      throw new Error('markdown parse failed');
    });
    chunkingServiceMock.chunkText.mockReturnValue([
      { chunkIndex: 0, content: 'chunk', metadata: { startOffset: 0, endOffset: 5 } },
    ]);
    embeddingProviderMock.embedBatch.mockResolvedValue([[0.1, 0.2]]);
    vectorRepositoryMock.upsert.mockResolvedValue(undefined);
    withTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb({}));
    documentChunkRepositoryMock.createMany.mockResolvedValue(undefined);
    documentChunkRepositoryMock.deleteByIds.mockResolvedValue(undefined);
    documentRepositoryMock.updateProcessingStatus.mockResolvedValue(undefined);

    await processingService.processDocument(docId, userId);

    expect(documentIndexServiceMock.startBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: docId,
        routeMode: 'structured',
      })
    );
    expect(markdownStructureParserMock.parse).toHaveBeenCalledWith('Some long text');
    expect(chunkingServiceMock.chunkText).toHaveBeenCalledWith('Some long text');
    expect(documentIndexServiceMock.completeBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        indexVersionId: 'idx-build-1',
        parseMethod: 'legacy-chunk-fallback',
      })
    );
    expect(documentIndexServiceMock.replaceGraph).not.toHaveBeenCalled();
  });

  it('should persist markdown structure graph when structured markdown parse succeeds', async () => {
    documentRepositoryMock.findById.mockResolvedValue({
      id: docId,
      knowledgeBaseId: kbId,
      chunkCount: 0,
      currentVersion: 1,
      documentType: 'markdown',
    });
    documentVersionRepositoryMock.findByDocumentAndVersion.mockResolvedValue({
      textContent: '# Heading\n\nBody',
    });
    documentIndexServiceMock.startBuild.mockResolvedValue({ id: 'idx-build-2' });
    documentParseRouterServiceMock.decideRoute.mockReturnValue({
      routeMode: 'structured',
      reason: 'meets_threshold',
      estimatedTokens: 6000,
      thresholdTokens: 5000,
      structuredCandidate: true,
      rolloutMode: 'all',
    });
    markdownStructureParserMock.parse.mockReturnValue({
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
          content: '',
          contentPreview: '',
          tokenCount: 0,
        },
      ],
      edges: [],
      parseMethod: 'structured',
      parserRuntime: 'markdown',
      headingCount: 1,
    });
    chunkingServiceMock.chunkText.mockReturnValue([
      { chunkIndex: 0, content: 'chunk', metadata: { startOffset: 0, endOffset: 5 } },
    ]);
    embeddingProviderMock.embedBatch.mockResolvedValue([[0.1, 0.2]]);
    vectorRepositoryMock.upsert.mockResolvedValue(undefined);
    withTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb({}));
    documentChunkRepositoryMock.createMany.mockResolvedValue(undefined);
    documentChunkRepositoryMock.deleteByIds.mockResolvedValue(undefined);
    documentRepositoryMock.updateProcessingStatus.mockResolvedValue(undefined);

    await processingService.processDocument(docId, userId);

    expect(markdownStructureParserMock.parse).toHaveBeenCalledWith('# Heading\n\nBody');
    expect(documentIndexServiceMock.replaceGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: docId,
        indexVersionId: 'idx-build-2',
      })
    );
    expect(documentIndexServiceMock.completeBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        indexVersionId: 'idx-build-2',
        parseMethod: 'structured',
        parserRuntime: 'markdown',
        headingCount: 1,
      })
    );
  });

  it('should persist docx structure graph when structured docx parse succeeds', async () => {
    documentRepositoryMock.findById.mockResolvedValue({
      id: docId,
      knowledgeBaseId: kbId,
      chunkCount: 0,
      currentVersion: 1,
      documentType: 'docx',
    });
    documentVersionRepositoryMock.findByDocumentAndVersion.mockResolvedValue({
      storageKey: 'docx-key',
      textContent: 'Docx extracted text',
    });
    documentIndexServiceMock.startBuild.mockResolvedValue({ id: 'idx-build-docx' });
    documentParseRouterServiceMock.decideRoute.mockReturnValue({
      routeMode: 'structured',
      reason: 'meets_threshold',
      estimatedTokens: 6000,
      thresholdTokens: 5000,
      structuredCandidate: true,
      rolloutMode: 'all',
    });
    docxStructureParserMock.parseFromStorage.mockResolvedValue({
      nodes: [],
      edges: [],
      parseMethod: 'structured',
      parserRuntime: 'docx',
      headingCount: 2,
    });
    chunkingServiceMock.chunkText.mockReturnValue([
      { chunkIndex: 0, content: 'chunk', metadata: { startOffset: 0, endOffset: 5 } },
    ]);
    embeddingProviderMock.embedBatch.mockResolvedValue([[0.1, 0.2]]);
    vectorRepositoryMock.upsert.mockResolvedValue(undefined);
    withTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb({}));
    documentChunkRepositoryMock.createMany.mockResolvedValue(undefined);
    documentChunkRepositoryMock.deleteByIds.mockResolvedValue(undefined);
    documentRepositoryMock.updateProcessingStatus.mockResolvedValue(undefined);

    await processingService.processDocument(docId, userId);

    expect(docxStructureParserMock.parseFromStorage).toHaveBeenCalledWith('docx-key');
    expect(documentIndexServiceMock.replaceGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: docId,
        indexVersionId: 'idx-build-docx',
      })
    );
    expect(documentIndexServiceMock.completeBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        indexVersionId: 'idx-build-docx',
        parserRuntime: 'docx',
        headingCount: 2,
      })
    );
  });

  it('should persist pdf structure graph when structured pdf parse succeeds', async () => {
    documentRepositoryMock.findById.mockResolvedValue({
      id: docId,
      knowledgeBaseId: kbId,
      chunkCount: 0,
      currentVersion: 1,
      documentType: 'pdf',
    });
    documentVersionRepositoryMock.findByDocumentAndVersion.mockResolvedValue({
      storageKey: 'pdf-key',
      textContent: 'Pdf extracted text',
    });
    documentIndexServiceMock.startBuild.mockResolvedValue({ id: 'idx-build-pdf' });
    documentParseRouterServiceMock.decideRoute.mockReturnValue({
      routeMode: 'structured',
      reason: 'meets_threshold',
      estimatedTokens: 6000,
      thresholdTokens: 5000,
      structuredCandidate: true,
      rolloutMode: 'all',
    });
    pdfStructureParserMock.parseFromStorageWithImages.mockResolvedValue({
      nodes: [],
      edges: [],
      parseMethod: 'structured',
      parserRuntime: 'pdf',
      headingCount: 3,
    });
    chunkingServiceMock.chunkText.mockReturnValue([
      { chunkIndex: 0, content: 'chunk', metadata: { startOffset: 0, endOffset: 5 } },
    ]);
    embeddingProviderMock.embedBatch.mockResolvedValue([[0.1, 0.2]]);
    vectorRepositoryMock.upsert.mockResolvedValue(undefined);
    withTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb({}));
    documentChunkRepositoryMock.createMany.mockResolvedValue(undefined);
    documentChunkRepositoryMock.deleteByIds.mockResolvedValue(undefined);
    documentRepositoryMock.updateProcessingStatus.mockResolvedValue(undefined);

    await processingService.processDocument(docId, userId);

    expect(pdfStructureParserMock.parseFromStorageWithImages).toHaveBeenCalledWith('pdf-key');
    expect(documentIndexServiceMock.replaceGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: docId,
        indexVersionId: 'idx-build-pdf',
      })
    );
    expect(documentIndexServiceMock.completeBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        indexVersionId: 'idx-build-pdf',
        parserRuntime: 'pdf',
        headingCount: 3,
      })
    );
  });

  it('should handle document not found', async () => {
    documentRepositoryMock.findById.mockResolvedValue(null);

    await processingService.processDocument(docId, userId);

    expect(documentRepositoryMock.updateProcessingStatus).toHaveBeenCalledWith(
      docId,
      'failed',
      expect.stringContaining('Document not found')
    );
  });

  it('should handle no text content gracefully', async () => {
    documentVersionRepositoryMock.findByDocumentAndVersion.mockResolvedValue({
      textContent: null,
    });

    withTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb({}));
    documentRepositoryMock.updateProcessingStatus.mockResolvedValue(undefined);
    vectorRepositoryMock.deleteByDocumentId.mockResolvedValue(true);

    await processingService.processDocument(docId, userId);

    // Should complete with 0 chunks
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: docId }),
      'No text content available for processing'
    );
  });

  it('should handle double error (processing fails + status update fails)', async () => {
    documentRepositoryMock.findById.mockRejectedValue(new Error('DB connection lost'));
    documentRepositoryMock.updateProcessingStatus.mockRejectedValue(
      new Error('Still can not connect')
    );

    await processingService.processDocument(docId, userId);

    // Should log both errors
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: docId }),
      'Document processing failed'
    );
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: docId }),
      'Failed to update document status to failed'
    );
  });

  it('should always release lock even on error', async () => {
    documentRepositoryMock.findById.mockRejectedValue(new Error('Crash'));
    documentRepositoryMock.updateProcessingStatus.mockResolvedValue(undefined);

    await processingService.processDocument(docId, userId);

    // Try to acquire lock again - should succeed since it was released
    const updateSetMock = {
      where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    };
    const updateMock = {
      set: vi.fn().mockReturnValue(updateSetMock),
    };
    dbMock.update.mockReturnValue(updateMock);

    const lockResult = await processingService.acquireProcessingLock(docId);
    expect(lockResult).toBe(true);

    // Clean up
    processingService.releaseProcessingLock(docId);
  });
});
