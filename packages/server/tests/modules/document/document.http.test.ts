import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';

const { authenticateMock, createSanitizeMiddlewareMock, documentControllerMock } = vi.hoisted(
  () => {
    const authenticate: RequestHandler = (req, res, next) => {
      if (req.headers.authorization === 'Bearer valid-access') {
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
      documentControllerMock: {
        listTrash: vi.fn((_req, res) =>
          res.status(200).json({ success: true, route: 'list-trash' })
        ),
        clearTrash: vi.fn((_req, res) =>
          res.status(200).json({ success: true, route: 'clear-trash' })
        ),
        restore: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'restore' })),
        permanentDelete: vi.fn((_req, res) =>
          res.status(200).json({ success: true, route: 'permanent-delete' })
        ),
        upload: vi.fn((_req, res) => res.status(201).json({ success: true, route: 'upload' })),
        list: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'list' })),
        getContent: vi.fn((_req, res) =>
          res.status(200).json({ success: true, route: 'get-content' })
        ),
        saveContent: vi.fn((_req, res) =>
          res.status(200).json({ success: true, route: 'save-content' })
        ),
        getById: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'get-by-id' })),
        update: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'update' })),
        delete: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'delete' })),
        download: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'download' })),
        preview: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'preview' })),
        getVersionHistory: vi.fn((_req, res) =>
          res.status(200).json({ success: true, route: 'version-history' })
        ),
        uploadNewVersion: vi.fn((_req, res) =>
          res.status(201).json({ success: true, route: 'upload-version' })
        ),
        restoreVersion: vi.fn((_req, res) =>
          res.status(200).json({ success: true, route: 'restore-version' })
        ),
      },
    };
  }
);

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

vi.mock('@modules/document/controllers/document.controller', () => ({
  documentController: documentControllerMock,
}));

vi.mock('@shared/middleware', async () => {
  const actual = await vi.importActual<typeof import('@shared/middleware')>('@shared/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    createSanitizeMiddleware: createSanitizeMiddlewareMock,
  };
});

import documentRoutes from '@modules/document/document.routes';

describe('document.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/documents', documentRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
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

  it('should reject unauthenticated list request', async () => {
    const response = await fetch(`${baseUrl}/documents`);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(documentControllerMock.list).not.toHaveBeenCalled();
  });

  it('should validate list query parameters', async () => {
    const response = await fetch(`${baseUrl}/documents?page=0&pageSize=20`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(documentControllerMock.list).not.toHaveBeenCalled();
  });

  it('should call list controller for valid query', async () => {
    const response = await fetch(`${baseUrl}/documents?page=1&pageSize=20`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.route).toBe('list');
    expect(documentControllerMock.list).toHaveBeenCalledTimes(1);
  });

  it('should reject invalid upload file type', async () => {
    const formData = new FormData();
    formData.set(
      'file',
      new Blob(['bad binary'], { type: 'application/x-msdownload' }),
      'payload.exe'
    );

    const response = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_FILE_TYPE');
    expect(documentControllerMock.upload).not.toHaveBeenCalled();
  });

  it('should reject oversized upload file', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['0123456789'], { type: 'text/plain' }), 'huge.txt');

    const response = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('FILE_TOO_LARGE');
    expect(documentControllerMock.upload).not.toHaveBeenCalled();
  });

  it('should validate save-content body', async () => {
    const response = await fetch(`${baseUrl}/documents/doc-1/content`, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: 'x'.repeat(500001),
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(documentControllerMock.saveContent).not.toHaveBeenCalled();
  });
});
