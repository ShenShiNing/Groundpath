import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const VALID_KB_ID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_DOCUMENT_ID = '223e4567-e89b-12d3-a456-426614174000';

const {
  authenticateMock,
  createSanitizeMiddlewareMock,
  generalRateLimiterMock,
  documentServiceMock,
  requireKnowledgeBaseOwnershipMock,
} = vi.hoisted(() => {
  const authenticate: RequestHandler = (req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-access') {
      req.user = {
        sub: 'user-1',
        sid: 'sid-1',
        email: 'user-1@example.com',
        username: 'user-1',
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

  const passthroughMiddleware: RequestHandler = (_req, _res, next) => next();
  const documentService = {
    upload: vi.fn(),
    uploadNewVersion: vi.fn(),
  };

  return {
    authenticateMock: vi.fn(authenticate),
    createSanitizeMiddlewareMock: vi.fn(() => passthroughMiddleware),
    generalRateLimiterMock: vi.fn(passthroughMiddleware),
    documentServiceMock: documentService,
    requireKnowledgeBaseOwnershipMock: vi.fn(() => passthroughMiddleware),
  };
});

vi.mock('@modules/document/services/document.service', () => ({
  documentService: documentServiceMock,
}));

vi.mock('@modules/document/public/documents', () => ({
  documentService: documentServiceMock,
}));

vi.mock('@modules/knowledge-base/public/ownership', () => ({
  requireKnowledgeBaseOwnership: requireKnowledgeBaseOwnershipMock,
}));

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    createSanitizeMiddleware: createSanitizeMiddlewareMock,
    generalRateLimiter: generalRateLimiterMock,
  };
});

import documentRoutes from '@modules/document/document.routes';
import knowledgeBaseRoutes from '@modules/knowledge-base/knowledge-base.routes';

describe('multipart upload http regression', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use('/api/v1/documents', documentRoutes);
    app.use('/api/v1/knowledge-bases', knowledgeBaseRoutes);
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

    vi.mocked(documentServiceMock.upload).mockResolvedValue({ id: 'doc-1' } as never);
    vi.mocked(documentServiceMock.uploadNewVersion).mockResolvedValue({ id: 'doc-1' } as never);
  });

  it('should accept multipart metadata for POST /documents without getValidatedBody runtime failure', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['hello'], { type: 'text/plain' }), 'runtime.txt');
    formData.set('knowledgeBaseId', VALID_KB_ID);
    formData.set('title', 'Runtime Doc');
    formData.set('description', 'Multipart metadata');

    const response = await fetch(`${baseUrl}/api/v1/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });
    const body = (await response.json()) as HttpTestBody<{ document: { id: string } }>;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.document.id).toBe('doc-1');
    expect(documentServiceMock.upload).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        mimetype: 'text/plain',
        originalname: 'runtime.txt',
        size: 5,
      }),
      {
        knowledgeBaseId: VALID_KB_ID,
        title: 'Runtime Doc',
        description: 'Multipart metadata',
      },
      expect.objectContaining({
        ipAddress: expect.any(String),
      })
    );
  });

  it('should accept multipart metadata for POST /documents/:id/versions', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['v2'], { type: 'text/plain' }), 'runtime-v2.txt');
    formData.set('changeNote', 'Version 2');

    const response = await fetch(`${baseUrl}/api/v1/documents/${VALID_DOCUMENT_ID}/versions`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });
    const body = (await response.json()) as HttpTestBody<{ document: { id: string } }>;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.document.id).toBe('doc-1');
    expect(documentServiceMock.uploadNewVersion).toHaveBeenCalledWith(
      VALID_DOCUMENT_ID,
      'user-1',
      expect.objectContaining({
        mimetype: 'text/plain',
        originalname: 'runtime-v2.txt',
        size: 2,
      }),
      { changeNote: 'Version 2' },
      expect.objectContaining({
        ipAddress: expect.any(String),
      })
    );
  });

  it('should validate multipart metadata for POST /knowledge-bases/:id/documents', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['hello'], { type: 'text/plain' }), 'invalid.txt');
    formData.set('title', '');

    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases/${VALID_KB_ID}/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(documentServiceMock.upload).not.toHaveBeenCalled();
  });

  it('should read validated multipart metadata in nested knowledge-base upload', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['hello'], { type: 'text/plain' }), 'nested.txt');
    formData.set('title', 'Nested Doc');
    formData.set('description', 'Nested multipart metadata');

    const response = await fetch(`${baseUrl}/api/v1/knowledge-bases/${VALID_KB_ID}/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });
    const body = (await response.json()) as HttpTestBody<{ document: { id: string } }>;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.document.id).toBe('doc-1');
    expect(documentServiceMock.upload).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        mimetype: 'text/plain',
        originalname: 'nested.txt',
        size: 5,
      }),
      {
        knowledgeBaseId: VALID_KB_ID,
        title: 'Nested Doc',
        description: 'Nested multipart metadata',
      },
      expect.objectContaining({
        ipAddress: expect.any(String),
      })
    );
  });
});
