import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const {
  authenticateMock,
  summaryControllerMock,
  analysisControllerMock,
  generationControllerMock,
  requireDocumentOwnershipMock,
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

  return {
    authenticateMock: vi.fn(authenticate),
    requireDocumentOwnershipMock: vi.fn(() => (_req, _res, next) => next()),
    summaryControllerMock: {
      generate: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'summary' })),
      stream: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'summary-stream' })
      ),
    },
    analysisControllerMock: {
      analyze: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'analyze' })),
      extractKeywords: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'keywords' })
      ),
      extractEntities: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'entities' })
      ),
      getStructure: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'structure' })
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
  };
});

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
  };
});

vi.mock('@modules/document-ai/controllers/summary.controller', () => ({
  summaryController: summaryControllerMock,
}));

vi.mock('@modules/document-ai/controllers/analysis.controller', () => ({
  analysisController: analysisControllerMock,
}));

vi.mock('@modules/document-ai/controllers/generation.controller', () => ({
  generationController: generationControllerMock,
}));

vi.mock('@modules/document/public/ownership', () => ({
  requireDocumentOwnership: requireDocumentOwnershipMock,
}));

import documentAiRoutes from '@modules/document-ai/document-ai.routes';

describe('document-ai.routes http behavior', () => {
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

  it('should reject unauthenticated summary request', async () => {
    const response = await fetch(`${baseUrl}/document-ai/doc-1/summary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ length: 'short' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(summaryControllerMock.generate).not.toHaveBeenCalled();
  });

  it('should validate summary payload enum boundary', async () => {
    const response = await fetch(`${baseUrl}/document-ai/doc-1/summary`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ length: 'very-long' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(summaryControllerMock.generate).not.toHaveBeenCalled();
  });

  it('should validate analyze maxKeywords upper bound', async () => {
    const response = await fetch(`${baseUrl}/document-ai/doc-1/analyze`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        analysisTypes: ['keywords'],
        maxKeywords: 51,
      }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(analysisControllerMock.analyze).not.toHaveBeenCalled();
  });

  it('should validate keywords payload maxKeywords upper bound', async () => {
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
    expect(analysisControllerMock.extractKeywords).not.toHaveBeenCalled();
  });

  it('should validate entities payload maxEntities upper bound', async () => {
    const response = await fetch(`${baseUrl}/document-ai/doc-1/analyze/entities`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ maxEntities: 101 }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(analysisControllerMock.extractEntities).not.toHaveBeenCalled();
  });

  it('should call structure endpoint without body', async () => {
    const response = await fetch(`${baseUrl}/document-ai/doc-1/analyze/structure`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('structure');
    expect(analysisControllerMock.getStructure).toHaveBeenCalledTimes(1);
  });

  it('should pass valid keywords payload to controller', async () => {
    const response = await fetch(`${baseUrl}/document-ai/doc-1/analyze/keywords`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ maxKeywords: 8, language: 'en' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('keywords');
    expect(analysisControllerMock.extractKeywords).toHaveBeenCalledTimes(1);
  });

  it('should validate generate payload for empty prompt', async () => {
    const response = await fetch(`${baseUrl}/document-ai/generate`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prompt: '' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(generationControllerMock.generate).not.toHaveBeenCalled();
  });

  it('should validate stream-generate payload maxLength lower bound', async () => {
    const response = await fetch(`${baseUrl}/document-ai/generate/stream`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'hello', maxLength: 99 }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(generationControllerMock.streamGenerate).not.toHaveBeenCalled();
  });

  it('should validate expand payload enum boundary', async () => {
    const response = await fetch(`${baseUrl}/document-ai/doc-1/expand`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        instruction: 'expand this',
        position: 'middle',
      }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(generationControllerMock.expand).not.toHaveBeenCalled();
  });

  it('should pass valid generate payload to controller', async () => {
    const response = await fetch(`${baseUrl}/document-ai/generate`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Write a short release summary.',
        style: 'formal',
        maxLength: 200,
        contextDocumentIds: ['123e4567-e89b-12d3-a456-426614174000'],
      }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('generate');
    expect(generationControllerMock.generate).toHaveBeenCalledTimes(1);
  });
});
