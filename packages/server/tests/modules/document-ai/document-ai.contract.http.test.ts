import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const {
  authenticateMock,
  aiRateLimiterMock,
  summaryControllerMock,
  generationControllerMock,
  analysisServiceMock,
  requireDocumentOwnershipMock,
} = vi.hoisted(() => {
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
    aiRateLimiterMock: vi.fn(passthrough),
    requireDocumentOwnershipMock: vi.fn(() => passthrough),
    summaryControllerMock: {
      generate: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'summary' })),
      stream: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'summary-stream' })
      ),
    },
    generationControllerMock: {
      generate: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'generate' })),
      streamGenerate: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'generate-stream' })
      ),
      expand: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'expand' })),
      streamExpand: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'expand-stream' })
      ),
    },
    analysisServiceMock: {
      analyze: vi.fn(),
      extractKeywords: vi.fn(),
      extractEntities: vi.fn(),
      getStructure: vi.fn(),
    },
  };
});

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    aiRateLimiter: aiRateLimiterMock,
  };
});

vi.mock('@modules/document-ai/controllers/summary.controller', () => ({
  summaryController: summaryControllerMock,
}));

vi.mock('@modules/document-ai/controllers/generation.controller', () => ({
  generationController: generationControllerMock,
}));

vi.mock('@modules/document-ai/services/analysis.service', () => ({
  analysisService: analysisServiceMock,
}));

vi.mock('@modules/document/public/ownership', () => ({
  requireDocumentOwnership: requireDocumentOwnershipMock,
}));

import documentAiRoutes from '@modules/document-ai/document-ai.routes';

describe('document-ai keywords/entities HTTP contract', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/document-ai', documentAiRoutes);

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

  it('should validate keywords payload and keep invalid requests away from the controller path', async () => {
    const response = await fetch(`${baseUrl}/document-ai/doc-1/analyze/keywords`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ maxKeywords: 51 }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(analysisServiceMock.extractKeywords).not.toHaveBeenCalled();
  });

  it('should pass parsed keyword defaults through the real analysis controller', async () => {
    analysisServiceMock.extractKeywords.mockResolvedValue({
      keywords: [{ word: 'AI', relevance: 0.95 }],
    });

    const response = await fetch(`${baseUrl}/document-ai/doc-1/analyze/keywords`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.data.keywords).toEqual([{ word: 'AI', relevance: 0.95 }]);
    expect(analysisServiceMock.extractKeywords).toHaveBeenCalledWith('user-1', 'doc-1', {
      maxKeywords: 10,
      language: undefined,
    });
  });

  it('should pass parsed entity defaults through the real analysis controller', async () => {
    analysisServiceMock.extractEntities.mockResolvedValue({
      entities: [{ text: 'OpenAI', type: 'organization', confidence: 0.99 }],
    });

    const response = await fetch(`${baseUrl}/document-ai/doc-1/analyze/entities`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.data.entities).toEqual([
      { text: 'OpenAI', type: 'organization', confidence: 0.99 },
    ]);
    expect(analysisServiceMock.extractEntities).toHaveBeenCalledWith('user-1', 'doc-1', {
      maxEntities: 20,
      language: undefined,
    });
  });
});
