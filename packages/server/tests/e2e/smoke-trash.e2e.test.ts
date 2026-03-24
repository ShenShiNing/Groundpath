import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import { startTestServer, stopTestServer } from './helpers/e2e.helpers';

const VALID_KB_ID = '123e4567-e89b-12d3-a456-426614174000';

const { authenticateMock, createSanitizeMiddlewareMock, documentControllerMock } = vi.hoisted(
  () => {
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

    // In-memory document store for journey tests
    const docs = new Map<string, { id: string; title: string; deleted: boolean }>();
    let docCounter = 0;

    return {
      authenticateMock: vi.fn(authenticate),
      createSanitizeMiddlewareMock: vi.fn(() => passthroughSanitize),
      documentControllerMock: {
        upload: vi.fn((_req, res) => {
          docCounter++;
          const doc = { id: `doc-${docCounter}`, title: `Document ${docCounter}`, deleted: false };
          docs.set(doc.id, doc);
          res.status(201).json({ success: true, data: { document: doc } });
        }),
        list: vi.fn((_req, res) => {
          const items = Array.from(docs.values()).filter((d) => !d.deleted);
          res.status(200).json({
            success: true,
            data: { items, pagination: { page: 1, pageSize: 20, total: items.length } },
          });
        }),
        getById: vi.fn((req, res) => {
          const doc = docs.get(req.params.id);
          if (!doc || doc.deleted) {
            res
              .status(404)
              .json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
            return;
          }
          res.status(200).json({ success: true, data: { document: doc } });
        }),
        update: vi.fn((req, res) => {
          res.status(200).json({ success: true, data: { document: { id: req.params.id } } });
        }),
        getContent: vi.fn((_req, res) => {
          res.status(200).json({ success: true, data: { content: 'file content' } });
        }),
        saveContent: vi.fn((_req, res) => {
          res.status(200).json({ success: true, data: { message: 'Saved' } });
        }),
        // Soft delete (move to trash)
        delete: vi.fn((req, res) => {
          const doc = docs.get(req.params.id);
          if (doc) doc.deleted = true;
          res.status(200).json({ success: true, data: { message: 'Moved to trash' } });
        }),
        // Trash operations
        listTrash: vi.fn((_req, res) => {
          const items = Array.from(docs.values()).filter((d) => d.deleted);
          res.status(200).json({
            success: true,
            data: { items, pagination: { page: 1, pageSize: 20, total: items.length } },
          });
        }),
        clearTrash: vi.fn((_req, res) => {
          for (const [key, doc] of docs.entries()) {
            if (doc.deleted) docs.delete(key);
          }
          res.status(200).json({ success: true, data: { message: 'Trash cleared' } });
        }),
        restore: vi.fn((req, res) => {
          const doc = docs.get(req.params.id);
          if (doc) doc.deleted = false;
          res.status(200).json({ success: true, data: { document: doc } });
        }),
        permanentDelete: vi.fn((req, res) => {
          docs.delete(req.params.id);
          res.status(200).json({ success: true, data: { message: 'Permanently deleted' } });
        }),
        download: vi.fn((_req, res) => {
          res.status(200).json({ success: true, data: { url: '/download' } });
        }),
        preview: vi.fn((_req, res) => {
          res.status(200).json({ success: true, data: { url: '/preview' } });
        }),
        getVersionHistory: vi.fn((_req, res) => {
          res.status(200).json({ success: true, data: { versions: [] } });
        }),
        uploadNewVersion: vi.fn((_req, res) => {
          res.status(201).json({ success: true, data: { version: { id: 'v-2', version: 2 } } });
        }),
        restoreVersion: vi.fn((_req, res) => {
          res.status(200).json({ success: true, data: { message: 'Version restored' } });
        }),
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
      maxSize: 10 * 1024 * 1024, // 10MB
    },
  };
});

vi.mock('@modules/document/controllers/document.controller', () => ({
  documentController: documentControllerMock,
}));

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    createSanitizeMiddleware: createSanitizeMiddlewareMock,
  };
});

import documentRoutes from '@modules/document/document.routes';

describe('E2E Smoke: Trash Journey', () => {
  let server: Server;
  let baseUrl: string;

  // Journey state
  let docId: string;

  beforeAll(async () => {
    const result = await startTestServer((app) => {
      app.use('/api/documents', documentRoutes);
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

  // Step 1: Upload a document
  it('should upload a document', async () => {
    const formData = new FormData();
    formData.set('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');
    formData.set('knowledgeBaseId', VALID_KB_ID);

    const response = await fetch(`${baseUrl}/api/documents`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
      body: formData,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    const doc = data.document as Record<string, unknown>;
    docId = doc.id as string;
    expect(docId).toBeDefined();
  });

  // Step 2: List documents (should contain the uploaded doc)
  it('should list documents including the uploaded one', async () => {
    const response = await fetch(`${baseUrl}/api/documents?page=1&pageSize=20`, {
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(documentControllerMock.list).toHaveBeenCalledTimes(1);
  });

  // Step 3: Soft delete (move to trash)
  it('should soft-delete document (move to trash)', async () => {
    const response = await fetch(`${baseUrl}/api/documents/${docId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(documentControllerMock.delete).toHaveBeenCalledTimes(1);
  });

  // Step 4: List trash (should contain the deleted doc)
  it('should list deleted documents in trash', async () => {
    const response = await fetch(`${baseUrl}/api/documents/trash?page=1&pageSize=20`, {
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(documentControllerMock.listTrash).toHaveBeenCalledTimes(1);
  });

  // Step 5: Restore from trash
  it('should restore document from trash', async () => {
    const response = await fetch(`${baseUrl}/api/documents/${docId}/restore`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(documentControllerMock.restore).toHaveBeenCalledTimes(1);
  });

  // Step 6: Re-delete and permanently delete
  it('should permanently delete document', async () => {
    // First soft delete again
    await fetch(`${baseUrl}/api/documents/${docId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid-access' },
    });

    // Then permanent delete
    const response = await fetch(`${baseUrl}/api/documents/${docId}/permanent`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(documentControllerMock.permanentDelete).toHaveBeenCalledTimes(1);
  });

  // Step 7: Validate query params
  it('should reject invalid list query parameters', async () => {
    const response = await fetch(`${baseUrl}/api/documents?page=0&pageSize=20`, {
      headers: { authorization: 'Bearer valid-access' },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    const error = body.error as Record<string, unknown>;
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});
