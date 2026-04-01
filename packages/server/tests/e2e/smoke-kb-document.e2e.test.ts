import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import {
  documentListResponseSchema,
  documentMutationResponseSchema,
  knowledgeBaseInfoResponseSchema,
  knowledgeBaseListResponseSchema,
} from '@groundpath/shared';
import { startTestServer, stopTestServer } from './helpers/e2e.helpers';

type StoredKnowledgeBase = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  embeddingProvider: 'openai' | 'zhipu' | 'ollama';
  embeddingModel: string;
  embeddingDimensions: number;
  documentCount: number;
  totalChunks: number;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
  deletedBy: string | null;
  deletedAt: Date | null;
};

type StoredDocument = {
  id: string;
  userId: string;
  knowledgeBaseId: string;
  title: string;
  description: string | null;
  currentVersion: number;
  activeIndexVersionId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
  documentType: 'pdf' | 'markdown' | 'text' | 'docx' | 'other';
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  processingError: string | null;
  processingStartedAt: Date | null;
  publishGeneration: number;
  chunkCount: number;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
  deletedBy: string | null;
  deletedAt: Date | null;
};

type StoredDocumentVersion = {
  id: string;
  documentId: string;
  version: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
  documentType: 'pdf' | 'markdown' | 'text' | 'docx' | 'other';
  storageKey: string;
  textContent: string | null;
  wordCount: number | null;
  source: 'upload' | 'edit' | 'ai_generate' | 'restore';
  changeNote: string | null;
  createdBy: string;
  createdAt: Date;
};

const {
  testUserId,
  authenticateMock,
  createSanitizeMiddlewareMock,
  passthroughMiddleware,
  knowledgeBases,
  documents,
  documentVersions,
  deletedStorageKeys,
  cloneKnowledgeBase,
  cloneDocument,
  cloneDocumentVersion,
  resolveDocumentKind,
  nextStorageKey,
} = vi.hoisted(() => {
  const testUserId = '11111111-1111-4111-8111-111111111111';
  const knowledgeBases = new Map<string, StoredKnowledgeBase>();
  const documents = new Map<string, StoredDocument>();
  const documentVersions = new Map<string, StoredDocumentVersion>();
  const deletedStorageKeys: string[] = [];
  let storageCounter = 0;

  const cloneKnowledgeBase = (kb: StoredKnowledgeBase): StoredKnowledgeBase => ({ ...kb });
  const cloneDocument = (doc: StoredDocument): StoredDocument => ({ ...doc });
  const cloneDocumentVersion = (version: StoredDocumentVersion): StoredDocumentVersion => ({
    ...version,
  });

  const passthroughMiddleware: RequestHandler = (_req, _res, next) => next();
  const authenticate: RequestHandler = (req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-access') {
      req.user = {
        sub: testUserId,
        sid: 'sid-e2e',
        email: 'e2e@example.com',
        username: 'e2e-user',
        status: 'active' as const,
        emailVerified: true,
      };
      next();
      return;
    }

    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid access token' },
    });
  };

  const resolveDocumentKind = (
    fileName: string,
    mimetype: string
  ): {
    fileExtension: string;
    documentType: StoredDocument['documentType'];
  } => {
    const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'bin';

    if (mimetype === 'text/plain') {
      return { fileExtension: extension || 'txt', documentType: 'text' };
    }
    if (mimetype === 'text/markdown') {
      return { fileExtension: extension || 'md', documentType: 'markdown' };
    }
    if (mimetype === 'application/pdf') {
      return { fileExtension: extension || 'pdf', documentType: 'pdf' };
    }
    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return { fileExtension: extension || 'docx', documentType: 'docx' };
    }

    return { fileExtension: extension || 'bin', documentType: 'other' };
  };

  const nextStorageKey = (userId: string, fileName: string): string => {
    storageCounter += 1;
    return `documents/${userId}/${storageCounter}-${fileName}`;
  };

  return {
    testUserId,
    authenticateMock: vi.fn(authenticate),
    createSanitizeMiddlewareMock: vi.fn(() => passthroughMiddleware),
    passthroughMiddleware,
    knowledgeBases,
    documents,
    documentVersions,
    deletedStorageKeys,
    cloneKnowledgeBase,
    cloneDocument,
    cloneDocumentVersion,
    resolveDocumentKind,
    nextStorageKey,
  };
});

vi.mock('@config/env', async () => {
  const actual = await vi.importActual<typeof import('@config/env')>('@config/env');
  return {
    ...actual,
    embeddingConfig: {
      ...actual.embeddingConfig,
      openai: {
        ...actual.embeddingConfig.openai,
        apiKey: 'openai-test-key',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      },
      zhipu: {
        ...actual.embeddingConfig.zhipu,
        apiKey: 'zhipu-test-key',
      },
    },
    documentConfig: {
      ...actual.documentConfig,
      maxSize: 10 * 1024 * 1024,
    },
  };
});

vi.mock('@core/db/db.utils', async () => {
  const actual = await vi.importActual<typeof import('@core/db/db.utils')>('@core/db/db.utils');
  return {
    ...actual,
    withTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ id: 'tx-e2e' })
    ),
  };
});

vi.mock('@core/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@core/logger/operation-logger', () => ({
  logOperation: vi.fn(),
}));

vi.mock('@modules/document/ports/document-processing.port', () => ({
  dispatchDocumentProcessing: vi.fn(() => Promise.resolve()),
}));

vi.mock('@modules/knowledge-base/repositories/knowledge-base.repository', () => ({
  knowledgeBaseRepository: {
    create: vi.fn(
      async (data: Omit<StoredKnowledgeBase, 'createdAt' | 'updatedAt' | 'deletedAt'>) => {
        const now = new Date();
        const kb: StoredKnowledgeBase = {
          id: data.id,
          userId: data.userId,
          name: data.name,
          description: data.description ?? null,
          embeddingProvider: data.embeddingProvider,
          embeddingModel: data.embeddingModel,
          embeddingDimensions: data.embeddingDimensions,
          documentCount: 0,
          totalChunks: 0,
          createdBy: data.createdBy,
          createdAt: now,
          updatedBy: data.createdBy,
          updatedAt: now,
          deletedBy: null,
          deletedAt: null,
        };
        knowledgeBases.set(kb.id, kb);
        return cloneKnowledgeBase(kb);
      }
    ),
    findById: vi.fn(async (id: string) => {
      const kb = knowledgeBases.get(id);
      return kb && kb.deletedAt === null ? cloneKnowledgeBase(kb) : undefined;
    }),
    findByIdAndUser: vi.fn(async (id: string, userId: string) => {
      const kb = knowledgeBases.get(id);
      return kb && kb.userId === userId && kb.deletedAt === null
        ? cloneKnowledgeBase(kb)
        : undefined;
    }),
    lockByIdAndUser: vi.fn(async (id: string, userId: string) => {
      const kb = knowledgeBases.get(id);
      return Boolean(kb && kb.userId === userId && kb.deletedAt === null);
    }),
    listByUser: vi.fn(async (userId: string, options?: { cursor?: string; pageSize?: number }) => {
      const pageSize = options?.pageSize ?? 20;
      const items = [...knowledgeBases.values()]
        .filter((kb) => kb.userId === userId && kb.deletedAt === null)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

      return {
        knowledgeBases: items.slice(0, pageSize).map(cloneKnowledgeBase),
        total: items.length,
        hasMore: items.length > pageSize,
        nextCursor: null,
      };
    }),
    countByUser: vi.fn(async (userId: string) => {
      return [...knowledgeBases.values()].filter(
        (kb) => kb.userId === userId && kb.deletedAt === null
      ).length;
    }),
    update: vi.fn(
      async (
        id: string,
        data: Partial<Pick<StoredKnowledgeBase, 'name' | 'description' | 'updatedBy'>>
      ) => {
        const kb = knowledgeBases.get(id);
        if (!kb || kb.deletedAt !== null) {
          return undefined;
        }

        if (data.name !== undefined) {
          kb.name = data.name;
        }
        if (data.description !== undefined) {
          kb.description = data.description;
        }
        if (data.updatedBy !== undefined) {
          kb.updatedBy = data.updatedBy;
        }
        kb.updatedAt = new Date();
        return cloneKnowledgeBase(kb);
      }
    ),
    softDelete: vi.fn(async (id: string, deletedBy: string) => {
      const kb = knowledgeBases.get(id);
      if (!kb) {
        return;
      }

      kb.deletedAt = new Date();
      kb.deletedBy = deletedBy;
      kb.updatedAt = kb.deletedAt;
      kb.updatedBy = deletedBy;
    }),
    incrementDocumentCount: vi.fn(async (id: string, delta: number) => {
      const kb = knowledgeBases.get(id);
      if (!kb) {
        return;
      }

      kb.documentCount = Math.max(0, kb.documentCount + delta);
      kb.updatedAt = new Date();
    }),
    incrementTotalChunks: vi.fn(async (id: string, delta: number) => {
      const kb = knowledgeBases.get(id);
      if (!kb) {
        return;
      }

      kb.totalChunks = Math.max(0, kb.totalChunks + delta);
      kb.updatedAt = new Date();
    }),
  },
}));

vi.mock('@modules/document/repositories/document.repository', () => ({
  documentRepository: {
    create: vi.fn(async (data: Omit<StoredDocument, 'createdAt' | 'updatedAt' | 'deletedAt'>) => {
      const now = new Date();
      const doc: StoredDocument = {
        id: data.id,
        userId: data.userId,
        knowledgeBaseId: data.knowledgeBaseId,
        title: data.title,
        description: data.description ?? null,
        currentVersion: data.currentVersion,
        activeIndexVersionId: data.activeIndexVersionId ?? null,
        fileName: data.fileName,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        fileExtension: data.fileExtension,
        documentType: data.documentType,
        processingStatus: data.processingStatus,
        processingError: data.processingError ?? null,
        processingStartedAt: data.processingStartedAt ?? null,
        publishGeneration: data.publishGeneration ?? 0,
        chunkCount: data.chunkCount ?? 0,
        createdBy: data.createdBy,
        createdAt: now,
        updatedBy: data.createdBy,
        updatedAt: now,
        deletedBy: null,
        deletedAt: null,
      };
      documents.set(doc.id, doc);
      return cloneDocument(doc);
    }),
    findByIdAndUser: vi.fn(async (id: string, userId: string) => {
      const doc = documents.get(id);
      return doc && doc.userId === userId && doc.deletedAt === null
        ? cloneDocument(doc)
        : undefined;
    }),
    listByKnowledgeBaseId: vi.fn(
      async (knowledgeBaseId: string, options?: { includeDeleted?: boolean }) => {
        return [...documents.values()]
          .filter((doc) =>
            options?.includeDeleted
              ? doc.knowledgeBaseId === knowledgeBaseId
              : doc.knowledgeBaseId === knowledgeBaseId && doc.deletedAt === null
          )
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map(cloneDocument);
      }
    ),
    list: vi.fn(
      async (
        userId: string,
        params: {
          pageSize?: number;
          cursor?: string;
          knowledgeBaseId?: string;
          documentType?: StoredDocument['documentType'];
          search?: string;
          sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'fileSize';
          sortOrder?: 'asc' | 'desc';
        }
      ) => {
        const pageSize = params.pageSize ?? 20;
        const sortBy = params.sortBy ?? 'createdAt';
        const sortOrder = params.sortOrder ?? 'desc';
        const items = [...documents.values()].filter((doc) => {
          if (doc.userId !== userId || doc.deletedAt !== null) {
            return false;
          }
          if (params.knowledgeBaseId && doc.knowledgeBaseId !== params.knowledgeBaseId) {
            return false;
          }
          if (params.documentType && doc.documentType !== params.documentType) {
            return false;
          }
          if (params.search && !doc.title.includes(params.search)) {
            return false;
          }
          return true;
        });

        items.sort((left, right) => {
          const direction = sortOrder === 'asc' ? 1 : -1;
          if (sortBy === 'title') {
            return direction * left.title.localeCompare(right.title);
          }
          if (sortBy === 'fileSize') {
            return direction * (left.fileSize - right.fileSize);
          }
          if (sortBy === 'updatedAt') {
            return direction * (left.updatedAt.getTime() - right.updatedAt.getTime());
          }
          return direction * (left.createdAt.getTime() - right.createdAt.getTime());
        });

        return {
          documents: items.slice(0, pageSize).map(cloneDocument),
          total: items.length,
          hasMore: items.length > pageSize,
          nextCursor: null,
        };
      }
    ),
    update: vi.fn(
      async (
        id: string,
        data: Partial<
          Pick<
            StoredDocument,
            'title' | 'description' | 'chunkCount' | 'processingStatus' | 'updatedBy'
          >
        >
      ) => {
        const doc = documents.get(id);
        if (!doc || doc.deletedAt !== null) {
          return undefined;
        }

        Object.assign(doc, data);
        doc.updatedAt = new Date();
        return cloneDocument(doc);
      }
    ),
    softDelete: vi.fn(async (id: string, deletedBy: string) => {
      const doc = documents.get(id);
      if (!doc) {
        return;
      }

      doc.deletedAt = new Date();
      doc.deletedBy = deletedBy;
      doc.updatedAt = doc.deletedAt;
      doc.updatedBy = deletedBy;
    }),
    hardDeleteByKnowledgeBaseId: vi.fn(async (knowledgeBaseId: string) => {
      for (const [documentId, document] of documents.entries()) {
        if (document.knowledgeBaseId === knowledgeBaseId) {
          documents.delete(documentId);
        }
      }
    }),
  },
}));

vi.mock('@modules/document/repositories/document-version.repository', () => ({
  documentVersionRepository: {
    create: vi.fn(
      async (data: Omit<StoredDocumentVersion, 'createdAt' | 'wordCount' | 'changeNote'>) => {
        const version: StoredDocumentVersion = {
          ...data,
          wordCount: null,
          changeNote: null,
          createdAt: new Date(),
        };
        documentVersions.set(version.id, version);
        return cloneDocumentVersion(version);
      }
    ),
    listByDocumentIds: vi.fn(async (documentIds: string[]) => {
      return [...documentVersions.values()]
        .filter((version) => documentIds.includes(version.documentId))
        .sort((left, right) => right.version - left.version)
        .map(cloneDocumentVersion);
    }),
  },
}));

vi.mock('@modules/document/services/document-storage.service', () => ({
  documentStorageService: {
    validateFile: vi.fn((file: { mimetype: string }) => {
      const allowed = new Set([
        'text/plain',
        'text/markdown',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ]);

      if (!allowed.has(file.mimetype)) {
        return {
          valid: false,
          error: `Invalid file type. Unsupported MIME type: ${file.mimetype}`,
        };
      }

      return { valid: true };
    }),
    uploadDocument: vi.fn(
      async (userId: string, file: { originalname: string; mimetype: string }) => {
        const { fileExtension, documentType } = resolveDocumentKind(
          file.originalname,
          file.mimetype
        );
        return {
          storageKey: nextStorageKey(userId, file.originalname),
          fileExtension,
          documentType,
          resolvedMimeType: file.mimetype,
        };
      }
    ),
    extractTextContent: vi.fn(async () => ({ text: 'Extracted text', truncated: false })),
    deleteDocument: vi.fn(async (storageKey: string) => {
      deletedStorageKeys.push(storageKey);
    }),
  },
  storageService: {
    deleteDocument: vi.fn(async (storageKey: string) => {
      deletedStorageKeys.push(storageKey);
    }),
  },
}));

vi.mock('@modules/document-index/public/repositories', () => ({
  documentNodeRepository: {
    listImageStorageKeysByDocumentIds: vi.fn(async () => []),
  },
}));

vi.mock('@modules/vector/public/repositories', () => ({
  vectorRepository: {
    deleteByKnowledgeBaseId: vi.fn(async () => true),
  },
}));

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    createSanitizeMiddleware: createSanitizeMiddlewareMock,
    generalRateLimiter: passthroughMiddleware,
  };
});

import knowledgeBaseRoutes from '@modules/knowledge-base/knowledge-base.routes';

function expectSuccessBody(body: Record<string, unknown>): Record<string, unknown> {
  expect(body.success).toBe(true);
  expect(body.error).toBeUndefined();
  return body.data as Record<string, unknown>;
}

function expectErrorCode(body: Record<string, unknown>, code: string): void {
  const error = body.error as Record<string, unknown>;
  expect(error.code).toBe(code);
}

describe('HTTP Contract Smoke: KB & Document Journey', () => {
  let server: Server;
  let baseUrl: string;
  let createdKbId: string;
  let createdDocumentId: string;

  beforeAll(async () => {
    const result = await startTestServer((app) => {
      app.use('/api/v1/knowledge-bases', knowledgeBaseRoutes);
      app.use(
        (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
          const statusCode = 'statusCode' in err ? (err as { statusCode: number }).statusCode : 500;
          const code = 'code' in err ? (err as { code: string }).code : 'INTERNAL_ERROR';
          res.status(statusCode).json({
            success: false,
            error: { code, message: err.message },
          });
        }
      );
    });
    server = result.server;
    baseUrl = result.baseUrl;
  });

  afterAll(async () => {
    await stopTestServer(server);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject unauthenticated KB creation', async () => {
    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test KB', embeddingProvider: 'openai' }),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expectErrorCode(body, 'UNAUTHORIZED');
  });

  it('should create a knowledge base with the shared response contract', async () => {
    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'E2E Test KB',
        embeddingProvider: 'openai',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    const data = expectSuccessBody(body);
    expect(data.knowledgeBase).toBeUndefined();

    const knowledgeBase = knowledgeBaseInfoResponseSchema.parse(data);
    createdKbId = knowledgeBase.id;

    expect(knowledgeBase.userId).toBe(testUserId);
    expect(knowledgeBase.name).toBe('E2E Test KB');
    expect(knowledgeBase.embeddingModel).toBe('text-embedding-3-small');
    expect(knowledgeBase.embeddingDimensions).toBe(1536);
    expect(knowledgeBase.documentCount).toBe(0);
    expect(knowledgeBases.has(createdKbId)).toBe(true);
  });

  it('should reject KB creation with missing name', async () => {
    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        embeddingProvider: 'openai',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expectErrorCode(body, 'VALIDATION_ERROR');
  });

  it('should list knowledge bases with the shared list contract', async () => {
    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases`, {
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const data = expectSuccessBody(body);
    expect(data.items).toBeUndefined();

    const listResult = knowledgeBaseListResponseSchema.parse(data);
    expect(listResult.knowledgeBases).toHaveLength(1);
    expect(listResult.knowledgeBases[0]?.id).toBe(createdKbId);
    expect(listResult.knowledgeBases[0]?.name).toBe('E2E Test KB');
    expect((data.knowledgeBases as Array<Record<string, unknown>>)[0]?.userId).toBeUndefined();
    expect(listResult.pagination).toMatchObject({
      pageSize: 20,
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('should get knowledge base by ID with the shared detail contract', async () => {
    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases/${createdKbId}`, {
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const data = expectSuccessBody(body);
    expect(data.knowledgeBase).toBeUndefined();

    const knowledgeBase = knowledgeBaseInfoResponseSchema.parse(data);
    expect(knowledgeBase.id).toBe(createdKbId);
    expect(knowledgeBase.name).toBe('E2E Test KB');
  });

  it('should update knowledge base name with the shared detail contract', async () => {
    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases/${createdKbId}`, {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Updated KB Name' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const data = expectSuccessBody(body);
    expect(data.knowledgeBase).toBeUndefined();

    const knowledgeBase = knowledgeBaseInfoResponseSchema.parse(data);
    expect(knowledgeBase.id).toBe(createdKbId);
    expect(knowledgeBase.name).toBe('Updated KB Name');
  });

  it('should upload a text document with the shared mutation contract', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['hello world'], { type: 'text/plain' }), 'test.txt');
    formData.set('title', 'Journey Doc');
    formData.set('description', 'Contract test document');

    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases/${createdKbId}/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    const data = expectSuccessBody(body);

    const uploadResult = documentMutationResponseSchema.parse(data);
    createdDocumentId = uploadResult.document.id;

    expect(uploadResult.message).toBe('Document uploaded successfully');
    expect(uploadResult.document.userId).toBe(testUserId);
    expect(uploadResult.document.title).toBe('Journey Doc');
    expect(uploadResult.document.description).toBe('Contract test document');
    expect(uploadResult.document.fileName).toBe('test.txt');
    expect(uploadResult.document.documentType).toBe('text');
    expect(uploadResult.document.currentVersion).toBe(1);
    expect(uploadResult.document.processingStatus).toBe('pending');
  });

  it('should list knowledge base documents with the shared list contract', async () => {
    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases/${createdKbId}/documents`, {
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const data = expectSuccessBody(body);
    expect(data.items).toBeUndefined();

    const listResult = documentListResponseSchema.parse(data);
    expect(listResult.documents).toHaveLength(1);
    expect(listResult.documents[0]?.id).toBe(createdDocumentId);
    expect(listResult.documents[0]?.title).toBe('Journey Doc');
    expect(listResult.documents[0]?.fileName).toBe('test.txt');

    const firstDocument = (data.documents as Array<Record<string, unknown>>)[0];
    expect(firstDocument?.currentVersion).toBeUndefined();
    expect(firstDocument?.userId).toBeUndefined();
    expect(firstDocument?.mimeType).toBeUndefined();
    expect(listResult.pagination).toMatchObject({
      pageSize: 20,
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('should reject upload without file', async () => {
    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases/${createdKbId}/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expectErrorCode(body, 'VALIDATION_ERROR');
  });

  it('should delete knowledge base through the real service layer', async () => {
    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases/${createdKbId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const data = expectSuccessBody(body);
    expect(data).toEqual({ message: 'Knowledge base deleted successfully' });
    expect(knowledgeBases.get(createdKbId)?.deletedAt).toBeInstanceOf(Date);
    expect(documents.has(createdDocumentId)).toBe(false);
    expect(deletedStorageKeys).toHaveLength(1);
  });
});
