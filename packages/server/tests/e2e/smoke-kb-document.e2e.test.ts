import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import { startTestServer, stopTestServer } from './helpers/e2e.helpers';

const {
  authenticateMock,
  knowledgeBaseControllerMock,
  documentServiceMock,
  createSanitizeMiddlewareMock,
} = vi.hoisted(() => {
  const authenticate: RequestHandler = (req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-access') {
      req.user = {
        sub: 'user-1',
        sid: 'sid-1',
        email: 'user@example.com',
        username: 'user1',
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

  const passthroughSanitize: RequestHandler = (_req, _res, next) => next();

  let kbCounter = 0;

  return {
    authenticateMock: vi.fn(authenticate),
    knowledgeBaseControllerMock: {
      create: vi.fn(async (req, res) => {
        kbCounter++;
        res.status(201).json({
          success: true,
          data: {
            knowledgeBase: {
              id: `a0000000-0000-0000-0000-00000000000${kbCounter}`,
              name: req.body.name,
              embeddingProvider: req.body.embeddingProvider,
              embeddingModel: req.body.embeddingModel,
              embeddingDimensions: req.body.embeddingDimensions,
              documentCount: 0,
              totalChunks: 0,
            },
          },
        });
      }),
      list: vi.fn(async (_req, res) => {
        res.status(200).json({
          success: true,
          data: {
            items: [
              {
                id: 'a0000000-0000-0000-0000-000000000001',
                name: 'Test KB',
                documentCount: 0,
                totalChunks: 0,
              },
            ],
          },
        });
      }),
      getById: vi.fn(async (req, res) => {
        res.status(200).json({
          success: true,
          data: {
            knowledgeBase: { id: req.params.id, name: 'Test KB', documentCount: 0 },
          },
        });
      }),
      update: vi.fn(async (req, res) => {
        res.status(200).json({
          success: true,
          data: { knowledgeBase: { id: req.params.id, name: req.body.name ?? 'Updated KB' } },
        });
      }),
      delete: vi.fn(async (req, res) => {
        res.status(200).json({
          success: true,
          data: { message: `Deleted ${req.params.id}` },
        });
      }),
    },
    documentServiceMock: {
      upload: vi.fn(async () => ({
        id: 'doc-1',
        title: 'test.txt',
        processingStatus: 'pending',
      })),
      list: vi.fn(async () => ({
        items: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      })),
    },
    createSanitizeMiddlewareMock: vi.fn(() => passthroughSanitize),
  };
});

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    createSanitizeMiddleware: createSanitizeMiddlewareMock,
  };
});

vi.mock('@modules/knowledge-base/controllers/knowledge-base.controller', () => ({
  knowledgeBaseController: knowledgeBaseControllerMock,
}));

vi.mock('@modules/document/public/documents', () => ({
  documentService: documentServiceMock,
}));

import knowledgeBaseRoutes from '@modules/knowledge-base/knowledge-base.routes';

describe('E2E Smoke: KB & Document Journey', () => {
  let server: Server;
  let baseUrl: string;

  // Journey state
  let createdKbId: string;

  beforeAll(async () => {
    const result = await startTestServer((app) => {
      app.use('/api/knowledge-bases', knowledgeBaseRoutes);
      // Error handler for asyncHandler errors
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

  // Step 1: Reject unauthenticated request
  it('should reject unauthenticated KB creation', async () => {
    const response = await fetch(`${baseUrl}/api/knowledge-bases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test KB' }),
    });

    expect(response.status).toBe(401);
  });

  // Step 2: Create knowledge base
  it('should create a knowledge base', async () => {
    const response = await fetch(`${baseUrl}/api/knowledge-bases`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'E2E Test KB',
        embeddingProvider: 'openai',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);

    const data = body.data as Record<string, unknown>;
    const kb = data.knowledgeBase as Record<string, unknown>;
    createdKbId = kb.id as string;
    expect(createdKbId).toBeDefined();
    expect(kb.name).toBe('E2E Test KB');
  });

  // Step 3: Reject invalid create (missing required fields)
  it('should reject KB creation with missing name', async () => {
    const response = await fetch(`${baseUrl}/api/knowledge-bases`, {
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
    const error = body.error as Record<string, unknown>;
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  // Step 4: List knowledge bases
  it('should list knowledge bases', async () => {
    const response = await fetch(`${baseUrl}/api/knowledge-bases`, {
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(knowledgeBaseControllerMock.list).toHaveBeenCalledTimes(1);
  });

  // Step 5: Get knowledge base by ID
  it('should get knowledge base by ID', async () => {
    const response = await fetch(`${baseUrl}/api/knowledge-bases/${createdKbId}`, {
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  // Step 6: Update knowledge base
  it('should update knowledge base name', async () => {
    const response = await fetch(`${baseUrl}/api/knowledge-bases/${createdKbId}`, {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Updated KB Name' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  // Step 7: Upload document to KB (valid text file)
  it('should upload a text document to KB', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['hello world'], { type: 'text/plain' }), 'test.txt');

    const response = await fetch(`${baseUrl}/api/knowledge-bases/${createdKbId}/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(documentServiceMock.upload).toHaveBeenCalledTimes(1);
  });

  // Step 8: Upload without file should fail
  it('should reject upload without file', async () => {
    const response = await fetch(`${baseUrl}/api/knowledge-bases/${createdKbId}/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    const error = body.error as Record<string, unknown>;
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  // Step 9: Delete knowledge base
  it('should delete knowledge base', async () => {
    const response = await fetch(`${baseUrl}/api/knowledge-bases/${createdKbId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(knowledgeBaseControllerMock.delete).toHaveBeenCalledTimes(1);
  });
});
