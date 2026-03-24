import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const { authenticateMock, generalRateLimiterMock, documentServiceMock } = vi.hoisted(() => {
  const authenticate: RequestHandler = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-access') {
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

  const passthrough: RequestHandler = (_req, _res, next) => next();

  return {
    authenticateMock: vi.fn(authenticate),
    generalRateLimiterMock: vi.fn(passthrough),
    documentServiceMock: {
      upload: vi.fn(async () => ({ id: 'doc-1', title: 'Uploaded KB Document' })),
      list: vi.fn(async () => ({
        documents: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
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
      maxSize: 1024,
    },
  };
});

vi.mock('@modules/document/public/documents', () => ({
  documentService: documentServiceMock,
}));

vi.mock('@modules/knowledge-base/services/knowledge-base.service', () => ({
  knowledgeBaseService: {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    generalRateLimiter: generalRateLimiterMock,
  };
});

import knowledgeBaseRoutes from '@modules/knowledge-base/knowledge-base.routes';

describe('knowledge-base nested document HTTP contract', () => {
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

  it('should reject invalid multipart metadata for nested KB upload', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['hello'], { type: 'text/plain' }), 'kb.txt');
    formData.set('title', '');

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
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(documentServiceMock.upload).not.toHaveBeenCalled();
  });

  it('should pass validated nested KB upload metadata through the real controller path', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['hello'], { type: 'text/plain' }), 'kb.txt');
    formData.set('title', 'Knowledge Base Upload');
    formData.set('description', 'Nested upload contract test');

    const response = await fetch(
      `${baseUrl}/knowledge-bases/123e4567-e89b-12d3-a456-426614174000/documents`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer valid-access' },
        body: formData,
      }
    );
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(documentServiceMock.upload).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        mimetype: 'text/plain',
        originalname: 'kb.txt',
      }),
      {
        knowledgeBaseId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Knowledge Base Upload',
        description: 'Nested upload contract test',
      },
      expect.objectContaining({
        ipAddress: expect.any(String),
        userAgent: expect.any(String),
      })
    );
  });
});
