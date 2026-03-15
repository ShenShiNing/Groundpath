import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const {
  authenticateMock,
  searchServiceMock,
  processingServiceMock,
  enqueueDocumentProcessingMock,
  documentServiceMock,
  knowledgeBaseServiceMock,
} = vi.hoisted(() => {
  type DocumentProcessingState = {
    id: string;
    currentVersion: number;
    processingStatus: string;
    processingError: null;
    chunkCount: number;
  } | null;

  const authenticate: RequestHandler = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const isAuthorized =
      (typeof authHeader === 'string' &&
        authHeader.replace(/^Bearer\s+/i, '') === 'valid-access') ||
      (Array.isArray(authHeader) &&
        authHeader.some((value) => value.replace(/^Bearer\s+/i, '') === 'valid-access'));

    if (isAuthorized) {
      req.user = {
        sub: 'user-1',
        sid: 'sid-1',
        email: 'user-1@example.com',
        username: 'user1',
        status: 'active',
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

  return {
    authenticateMock: vi.fn(authenticate),
    searchServiceMock: {
      searchInKnowledgeBase: vi.fn(async () => [
        {
          id: 'chunk-1',
          score: 0.91,
          payload: { documentId: 'doc-1', content: 'chunk content' },
        },
      ]),
    },
    processingServiceMock: {
      processDocument: vi.fn(async () => undefined),
    },
    enqueueDocumentProcessingMock: vi.fn(async () => 'job-1'),
    documentServiceMock: {
      getProcessingState: vi.fn<
        (documentId: string, userId: string) => Promise<DocumentProcessingState>
      >(async () => ({
        id: 'doc-1',
        currentVersion: 4,
        processingStatus: 'completed',
        processingError: null,
        chunkCount: 3,
      })),
    },
    knowledgeBaseServiceMock: {
      validateOwnership: vi.fn(async () => undefined),
    },
  };
});

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
  };
});

vi.mock('@modules/rag/services/search.service', () => ({
  searchService: searchServiceMock,
}));

vi.mock('@modules/rag/services/processing.service', () => ({
  processingService: processingServiceMock,
}));

vi.mock('@modules/rag/queue', () => ({
  enqueueDocumentProcessing: enqueueDocumentProcessingMock,
}));

vi.mock('@modules/document/services/document.service', () => ({
  documentService: documentServiceMock,
}));

vi.mock('@modules/knowledge-base/services/knowledge-base.service', () => ({
  knowledgeBaseService: knowledgeBaseServiceMock,
}));

import ragRoutes from '@modules/rag/rag.routes';

describe('rag.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/rag', ragRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get test server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject unauthenticated rag search request', async () => {
    const response = await fetch(`${baseUrl}/rag/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'hello',
        knowledgeBaseId: '123e4567-e89b-12d3-a456-426614174000',
      }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(searchServiceMock.searchInKnowledgeBase).not.toHaveBeenCalled();
  });

  it('should validate rag search payload', async () => {
    const response = await fetch(`${baseUrl}/rag/search`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: '',
        knowledgeBaseId: 'not-a-uuid',
      }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(knowledgeBaseServiceMock.validateOwnership).not.toHaveBeenCalled();
    expect(searchServiceMock.searchInKnowledgeBase).not.toHaveBeenCalled();
  });

  it('should validate scoreThreshold range', async () => {
    const response = await fetch(`${baseUrl}/rag/search`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: 'hello',
        knowledgeBaseId: '123e4567-e89b-12d3-a456-426614174000',
        scoreThreshold: 1.5,
      }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(searchServiceMock.searchInKnowledgeBase).not.toHaveBeenCalled();
  });

  it('should search rag chunks with valid payload', async () => {
    const response = await fetch(`${baseUrl}/rag/search`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: 'hello',
        knowledgeBaseId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 5,
        scoreThreshold: 0.2,
      }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(knowledgeBaseServiceMock.validateOwnership).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
      'user-1'
    );
    expect(searchServiceMock.searchInKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        query: 'hello',
        knowledgeBaseId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 5,
        scoreThreshold: 0.2,
      })
    );
    expect(body.data.chunks).toHaveLength(1);
  });

  it('should start document processing when document exists', async () => {
    const response = await fetch(`${baseUrl}/rag/process/doc-1`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
    expect(documentServiceMock.getProcessingState).toHaveBeenCalledWith('doc-1', 'user-1');
    expect(enqueueDocumentProcessingMock).toHaveBeenCalledWith('doc-1', 'user-1', {
      targetDocumentVersion: 4,
      reason: 'retry',
    });
  });

  it('should return NOT_FOUND when processing missing document', async () => {
    const { Errors } = await import('@core/errors');
    documentServiceMock.getProcessingState.mockRejectedValueOnce(Errors.notFound('Document'));

    const response = await fetch(`${baseUrl}/rag/process/missing-doc`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(enqueueDocumentProcessingMock).not.toHaveBeenCalled();
  });

  it('should return status for existing document', async () => {
    const response = await fetch(`${baseUrl}/rag/status/doc-1`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.documentId).toBe('doc-1');
    expect(body.data.processingStatus).toBe('completed');
    expect(documentServiceMock.getProcessingState).toHaveBeenCalledWith('doc-1', 'user-1');
  });

  it('should return NOT_FOUND for missing document status', async () => {
    const { Errors } = await import('@core/errors');
    documentServiceMock.getProcessingState.mockRejectedValueOnce(Errors.notFound('Document'));

    const response = await fetch(`${baseUrl}/rag/status/missing-doc`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
