import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  knowledgeBases: new Map<string, Record<string, unknown>>(),
  documents: new Map<string, Record<string, unknown>>(),
  versions: [] as Array<Record<string, unknown>>,
  nodeImageKeys: new Map<string, string[]>(),
  vectors: [] as Array<Record<string, unknown>>,
  storageDeletes: [] as string[],
  vectorDeletes: [] as Array<Record<string, unknown>>,
  failHardDelete: false,
}));

const mockEmbeddingConfig = vi.hoisted(() => ({
  openai: {
    apiKey: 'openai-test-key',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  },
  zhipu: {
    apiKey: 'zhipu-test-key',
    model: 'embedding-3',
    dimensions: 1024,
  },
  ollama: {
    apiKey: '',
    model: 'nomic-embed-text',
    dimensions: 768,
    baseUrl: 'http://localhost:11434',
  },
}));

const logOperationMock = vi.hoisted(() => vi.fn());

function cloneState() {
  return {
    knowledgeBases: new Map([...state.knowledgeBases.entries()].map(([id, kb]) => [id, { ...kb }])),
    documents: new Map([...state.documents.entries()].map(([id, doc]) => [id, { ...doc }])),
    versions: state.versions.map((version) => ({ ...version })),
    nodeImageKeys: new Map(
      [...state.nodeImageKeys.entries()].map(([documentId, keys]) => [documentId, [...keys]])
    ),
    vectors: state.vectors.map((vector) => ({ ...vector })),
    storageDeletes: [...state.storageDeletes],
    vectorDeletes: state.vectorDeletes.map((item) => ({ ...item })),
    failHardDelete: state.failHardDelete,
  };
}

function restoreState(snapshot: ReturnType<typeof cloneState>) {
  state.knowledgeBases = snapshot.knowledgeBases;
  state.documents = snapshot.documents;
  state.versions = snapshot.versions;
  state.nodeImageKeys = snapshot.nodeImageKeys;
  state.vectors = snapshot.vectors;
  state.storageDeletes = snapshot.storageDeletes;
  state.vectorDeletes = snapshot.vectorDeletes;
  state.failHardDelete = snapshot.failHardDelete;
}

function resetState() {
  state.knowledgeBases.clear();
  state.documents.clear();
  state.nodeImageKeys.clear();
  state.storageDeletes = [];
  state.vectorDeletes = [];
  state.failHardDelete = false;

  state.knowledgeBases.set('kb-1', {
    id: 'kb-1',
    userId: 'user-1',
    name: 'Primary KB',
    description: 'for delete orchestration',
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    documentCount: 1,
    totalChunks: 4,
    createdBy: 'user-1',
    createdAt: new Date('2026-03-20T00:00:00.000Z'),
    updatedBy: 'user-1',
    updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    deletedBy: null,
    deletedAt: null,
  });
  state.knowledgeBases.set('kb-keep', {
    id: 'kb-keep',
    userId: 'user-1',
    name: 'Keep KB',
    description: null,
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    documentCount: 1,
    totalChunks: 2,
    createdBy: 'user-1',
    createdAt: new Date('2026-03-20T00:00:00.000Z'),
    updatedBy: 'user-1',
    updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    deletedBy: null,
    deletedAt: null,
  });

  state.documents.set('doc-1', {
    id: 'doc-1',
    userId: 'user-1',
    knowledgeBaseId: 'kb-1',
    title: 'Active Doc',
    description: null,
    currentVersion: 2,
    activeIndexVersionId: 'idx-1',
    fileName: 'active.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    fileExtension: 'pdf',
    documentType: 'pdf',
    processingStatus: 'completed',
    processingError: null,
    processingStartedAt: null,
    publishGeneration: 0,
    chunkCount: 4,
    createdBy: 'user-1',
    createdAt: new Date('2026-03-20T00:00:00.000Z'),
    updatedBy: 'user-1',
    updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    deletedBy: null,
    deletedAt: null,
  });
  state.documents.set('doc-2', {
    id: 'doc-2',
    userId: 'user-1',
    knowledgeBaseId: 'kb-1',
    title: 'Trashed Doc',
    description: null,
    currentVersion: 1,
    activeIndexVersionId: null,
    fileName: 'trashed.md',
    mimeType: 'text/markdown',
    fileSize: 64,
    fileExtension: 'md',
    documentType: 'markdown',
    processingStatus: 'pending',
    processingError: null,
    processingStartedAt: null,
    publishGeneration: 0,
    chunkCount: 0,
    createdBy: 'user-1',
    createdAt: new Date('2026-03-21T00:00:00.000Z'),
    updatedBy: 'user-1',
    updatedAt: new Date('2026-03-21T00:00:00.000Z'),
    deletedBy: 'user-1',
    deletedAt: new Date('2026-03-22T00:00:00.000Z'),
  });
  state.documents.set('doc-keep', {
    id: 'doc-keep',
    userId: 'user-1',
    knowledgeBaseId: 'kb-keep',
    title: 'Other KB Doc',
    description: null,
    currentVersion: 1,
    activeIndexVersionId: 'idx-keep',
    fileName: 'keep.pdf',
    mimeType: 'application/pdf',
    fileSize: 256,
    fileExtension: 'pdf',
    documentType: 'pdf',
    processingStatus: 'completed',
    processingError: null,
    processingStartedAt: null,
    publishGeneration: 0,
    chunkCount: 2,
    createdBy: 'user-1',
    createdAt: new Date('2026-03-20T00:00:00.000Z'),
    updatedBy: 'user-1',
    updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    deletedBy: null,
    deletedAt: null,
  });

  state.versions = [
    {
      id: 'ver-1',
      documentId: 'doc-1',
      version: 1,
      fileName: 'active-v1.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      fileExtension: 'pdf',
      documentType: 'pdf',
      storageKey: 'storage/doc-1-v1.pdf',
      textContent: null,
      source: 'upload',
      changeNote: null,
      createdBy: 'user-1',
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
    },
    {
      id: 'ver-2',
      documentId: 'doc-1',
      version: 2,
      fileName: 'active-v2.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      fileExtension: 'pdf',
      documentType: 'pdf',
      storageKey: 'storage/doc-1-v2.pdf',
      textContent: null,
      source: 'upload',
      changeNote: null,
      createdBy: 'user-1',
      createdAt: new Date('2026-03-20T00:10:00.000Z'),
    },
    {
      id: 'ver-3',
      documentId: 'doc-2',
      version: 1,
      fileName: 'trashed.md',
      mimeType: 'text/markdown',
      fileSize: 64,
      fileExtension: 'md',
      documentType: 'markdown',
      storageKey: 'storage/doc-1-v2.pdf',
      textContent: '# restore copy',
      source: 'restore',
      changeNote: null,
      createdBy: 'user-1',
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
    },
    {
      id: 'ver-keep',
      documentId: 'doc-keep',
      version: 1,
      fileName: 'keep.pdf',
      mimeType: 'application/pdf',
      fileSize: 256,
      fileExtension: 'pdf',
      documentType: 'pdf',
      storageKey: 'storage/doc-keep-v1.pdf',
      textContent: null,
      source: 'upload',
      changeNote: null,
      createdBy: 'user-1',
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
    },
  ];

  state.nodeImageKeys.set('doc-1', ['storage/images/doc-1-figure.png']);
  state.nodeImageKeys.set('doc-2', [
    'storage/images/doc-1-figure.png',
    'storage/images/doc-2-figure.png',
  ]);
  state.nodeImageKeys.set('doc-keep', ['storage/images/doc-keep-figure.png']);

  state.vectors = [
    { id: 'vec-1', knowledgeBaseId: 'kb-1', documentId: 'doc-1', isDeleted: false },
    { id: 'vec-2', knowledgeBaseId: 'kb-1', documentId: 'doc-2', isDeleted: false },
    { id: 'vec-keep', knowledgeBaseId: 'kb-keep', documentId: 'doc-keep', isDeleted: false },
  ];
}

vi.mock('@config/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@config/env')>();
  return {
    ...original,
    embeddingConfig: mockEmbeddingConfig,
  };
});

vi.mock('@core/db/db.utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('@core/db/db.utils')>();
  return {
    ...original,
    withTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const snapshot = cloneState();
      try {
        return await callback({ id: 'tx-1' });
      } catch (error) {
        restoreState(snapshot);
        throw error;
      }
    },
  };
});

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@core/logger/operation-logger', () => ({
  logOperation: logOperationMock,
}));

vi.mock('@modules/knowledge-base/repositories/knowledge-base.repository', () => ({
  knowledgeBaseRepository: {
    create: vi.fn(),
    findByIdAndUser: vi.fn(async (id: string, userId: string) => {
      const kb = state.knowledgeBases.get(id);
      if (!kb || kb.userId !== userId || kb.deletedAt) {
        return undefined;
      }
      return kb;
    }),
    lockByIdAndUser: vi.fn(async (id: string, userId: string) => {
      const kb = state.knowledgeBases.get(id);
      return Boolean(kb && kb.userId === userId && !kb.deletedAt);
    }),
    listByUser: vi.fn(),
    countByUser: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(async (id: string, deletedBy: string) => {
      const kb = state.knowledgeBases.get(id);
      if (!kb) return;
      state.knowledgeBases.set(id, {
        ...kb,
        deletedBy,
        deletedAt: new Date('2026-03-23T00:00:00.000Z'),
      });
    }),
    findById: vi.fn(async (id: string) => {
      const kb = state.knowledgeBases.get(id);
      if (!kb || kb.deletedAt) {
        return undefined;
      }
      return kb;
    }),
    incrementDocumentCount: vi.fn(),
    incrementTotalChunks: vi.fn(),
  },
}));

vi.mock('@modules/document/public/repositories', () => ({
  documentRepository: {
    listByKnowledgeBaseId: vi.fn(
      async (knowledgeBaseId: string, options?: { includeDeleted?: boolean }) =>
        [...state.documents.values()]
          .filter((document) => document.knowledgeBaseId === knowledgeBaseId)
          .filter((document) => options?.includeDeleted || !document.deletedAt)
          .sort(
            (left, right) =>
              +(left.createdAt as Date) - +(right.createdAt as Date) ||
              (left.id as string).localeCompare(right.id as string)
          )
    ),
    hardDeleteByKnowledgeBaseId: vi.fn(async (knowledgeBaseId: string) => {
      if (state.failHardDelete) {
        throw new Error('hard delete failed');
      }

      const documentIds = [...state.documents.values()]
        .filter((document) => document.knowledgeBaseId === knowledgeBaseId)
        .map((document) => document.id as string);
      const documentIdSet = new Set(documentIds);

      for (const documentId of documentIds) {
        state.documents.delete(documentId);
        state.nodeImageKeys.delete(documentId);
      }

      state.versions = state.versions.filter(
        (version) => !documentIdSet.has(version.documentId as string)
      );
    }),
  },
  documentVersionRepository: {
    listByDocumentIds: vi.fn(async (documentIds: string[]) => {
      const documentIdSet = new Set(documentIds);
      return state.versions.filter((version) => documentIdSet.has(version.documentId as string));
    }),
  },
}));

vi.mock('@modules/document/public/storage', () => ({
  documentStorageService: {
    deleteDocument: vi.fn(async (storageKey: string) => {
      state.storageDeletes.push(storageKey);
    }),
  },
}));

vi.mock('@modules/document-index/public/repositories', () => ({
  documentNodeRepository: {
    listImageStorageKeysByDocumentIds: vi.fn(async (documentIds: string[]) =>
      documentIds.flatMap((documentId) => state.nodeImageKeys.get(documentId) ?? [])
    ),
  },
}));

vi.mock('@modules/vector/public/repositories', () => ({
  vectorRepository: {
    deleteByKnowledgeBaseId: vi.fn(async (collectionName: string, knowledgeBaseId: string) => {
      state.vectorDeletes.push({ collectionName, knowledgeBaseId });
      state.vectors = state.vectors.filter((vector) => vector.knowledgeBaseId !== knowledgeBaseId);
      return true;
    }),
  },
}));

import { knowledgeBaseService } from '@modules/knowledge-base/services/knowledge-base.service';

describe('knowledge base delete orchestration integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it('deletes documents, dedupes storage cleanup, and removes vectors for the knowledge base', async () => {
    await knowledgeBaseService.delete('kb-1', 'user-1', {
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(state.knowledgeBases.get('kb-1')).toMatchObject({
      deletedBy: 'user-1',
    });
    expect(state.knowledgeBases.get('kb-1')?.deletedAt).toBeInstanceOf(Date);
    expect(
      [...state.documents.values()].filter((document) => document.knowledgeBaseId === 'kb-1')
    ).toHaveLength(0);
    expect(
      state.versions.filter((version) => ['doc-1', 'doc-2'].includes(version.documentId as string))
    ).toHaveLength(0);
    expect(state.nodeImageKeys.has('doc-1')).toBe(false);
    expect(state.nodeImageKeys.has('doc-2')).toBe(false);
    expect(state.storageDeletes).toEqual([
      'storage/doc-1-v1.pdf',
      'storage/doc-1-v2.pdf',
      'storage/images/doc-1-figure.png',
      'storage/images/doc-2-figure.png',
    ]);
    expect(state.vectorDeletes).toEqual([
      {
        collectionName: 'embedding_openai_1536',
        knowledgeBaseId: 'kb-1',
      },
    ]);
    expect(state.vectors.map((vector) => vector.id)).toEqual(['vec-keep']);
    expect(logOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'knowledge_base.delete',
        resourceId: 'kb-1',
        metadata: expect.objectContaining({
          deletedDocumentCount: 2,
          deletedActiveDocumentCount: 1,
          deletedChunkTotal: 4,
          deletedVersionCount: 3,
          deletedStorageArtifactCount: 4,
        }),
      })
    );
  });

  it('rolls back the knowledge base delete transaction when document cleanup fails', async () => {
    state.failHardDelete = true;

    await expect(knowledgeBaseService.delete('kb-1', 'user-1')).rejects.toThrow(
      'hard delete failed'
    );

    expect(state.knowledgeBases.get('kb-1')).toMatchObject({
      deletedAt: null,
      deletedBy: null,
    });
    expect(
      [...state.documents.values()].filter((document) => document.knowledgeBaseId === 'kb-1')
    ).toHaveLength(2);
    expect(
      state.versions.filter((version) => ['doc-1', 'doc-2'].includes(version.documentId as string))
    ).toHaveLength(3);
    expect(state.storageDeletes).toEqual([]);
    expect(state.vectorDeletes).toEqual([]);
  });
});
