import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const {
  authenticateMock,
  createSanitizeMiddlewareMock,
  knowledgeBaseControllerMock,
  documentServiceMock,
} = vi.hoisted(() => {
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

  const passthroughSanitize: RequestHandler = (_req, _res, next) => next();

  return {
    authenticateMock: vi.fn(authenticate),
    createSanitizeMiddlewareMock: vi.fn(() => passthroughSanitize),
    knowledgeBaseControllerMock: {
      create: vi.fn((_req, res) => res.status(201).json({ success: true, route: 'kb-create' })),
      list: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'kb-list' })),
      getById: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'kb-get' })),
      update: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'kb-update' })),
      delete: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'kb-delete' })),
    },
    documentServiceMock: {
      upload: vi.fn(async () => ({ id: 'doc-1' })),
      list: vi.fn(async () => ({
        items: [{ id: 'doc-1' }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      })),
    },
  };
});

vi.mock('@config/env', async () => {
  const actual = await vi.importActual<typeof import('@config/env')>('@config/env');
  return {
    ...actual,
    documentConfig: {
      ...actual.documentConfig,
      maxSize: 8,
    },
  };
});

vi.mock('@modules/knowledge-base/controllers/knowledge-base.controller', () => ({
  knowledgeBaseController: knowledgeBaseControllerMock,
}));

vi.mock('@modules/document/services/document', () => ({
  documentService: documentServiceMock,
}));

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    createSanitizeMiddleware: createSanitizeMiddlewareMock,
  };
});

import knowledgeBaseRoutes from '@modules/knowledge-base/knowledge-base.routes';

describe('knowledge-base.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/knowledge-bases', knowledgeBaseRoutes);
    app.use(
      (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          'message' in err &&
          'statusCode' in err &&
          typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ) {
          const appError = err as { code: string; message: string; statusCode: number };
          res.status(appError.statusCode).json({
            success: false,
            error: { code: appError.code, message: appError.message },
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        });
      }
    );

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

  it('should reject unauthenticated create request', async () => {
    const response = await fetch(`${baseUrl}/knowledge-bases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'kb-1' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(knowledgeBaseControllerMock.create).not.toHaveBeenCalled();
  });

  it('should validate create payload', async () => {
    const response = await fetch(`${baseUrl}/knowledge-bases`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(knowledgeBaseControllerMock.create).not.toHaveBeenCalled();
  });

  it('should pass valid create request to controller', async () => {
    const response = await fetch(`${baseUrl}/knowledge-bases`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'kb-main', embeddingProvider: 'openai' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(201);
    expect(body.route).toBe('kb-create');
    expect(knowledgeBaseControllerMock.create).toHaveBeenCalledTimes(1);
  });

  it('should reject document upload when knowledge base id is invalid uuid', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['hello'], { type: 'text/plain' }), 'a.txt');

    const response = await fetch(`${baseUrl}/knowledge-bases/not-a-uuid/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(documentServiceMock.upload).not.toHaveBeenCalled();
  });

  it('should reject document upload when file is missing', async () => {
    const response = await fetch(
      `${baseUrl}/knowledge-bases/123e4567-e89b-12d3-a456-426614174000/documents`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer valid-access' },
      }
    );
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(documentServiceMock.upload).not.toHaveBeenCalled();
  });

  it('should reject oversized document upload', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['0123456789'], { type: 'text/plain' }), 'large.txt');

    const response = await fetch(
      `${baseUrl}/knowledge-bases/123e4567-e89b-12d3-a456-426614174000/documents`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer valid-access' },
        body: formData,
      }
    );
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('FILE_TOO_LARGE');
    expect(documentServiceMock.upload).not.toHaveBeenCalled();
  });

  it('should validate list-documents query parameters', async () => {
    const response = await fetch(
      `${baseUrl}/knowledge-bases/123e4567-e89b-12d3-a456-426614174000/documents?page=0&pageSize=20`,
      {
        headers: { authorization: 'Bearer valid-access' },
      }
    );
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(documentServiceMock.list).not.toHaveBeenCalled();
  });

  it('should return documents for valid list-documents request', async () => {
    const response = await fetch(
      `${baseUrl}/knowledge-bases/123e4567-e89b-12d3-a456-426614174000/documents?page=1&pageSize=20`,
      {
        headers: { authorization: 'Bearer valid-access' },
      }
    );
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(documentServiceMock.list).toHaveBeenCalledTimes(1);
  });
});
