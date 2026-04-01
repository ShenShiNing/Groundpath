import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const { authenticateMock, llmConfigControllerMock } = vi.hoisted(() => {
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
    llmConfigControllerMock: {
      getConfig: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'llm-get-config' })
      ),
      updateConfig: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'llm-update-config' })
      ),
      deleteConfig: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'llm-delete-config' })
      ),
      testConnection: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'llm-test-connection' })
      ),
      getProviders: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'llm-get-providers' })
      ),
      fetchModels: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'llm-fetch-models' })
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

vi.mock('@modules/llm/controllers/llm-config.controller', () => ({
  llmConfigController: llmConfigControllerMock,
}));

import llmRoutes from '@modules/llm/llm.routes';

describe('llm.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/llm', llmRoutes);

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

  it('should reject unauthenticated get-config request', async () => {
    const response = await fetch(`${baseUrl}/llm/config`);
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(llmConfigControllerMock.getConfig).not.toHaveBeenCalled();
  });

  it('should allow authenticated get-config request', async () => {
    const response = await fetch(`${baseUrl}/llm/config`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('llm-get-config');
    expect(llmConfigControllerMock.getConfig).toHaveBeenCalledTimes(1);
  });

  it('should validate update-config payload', async () => {
    const response = await fetch(`${baseUrl}/llm/config`, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ baseUrl: 'not-a-url' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(llmConfigControllerMock.updateConfig).not.toHaveBeenCalled();
  });

  it('should call update-config endpoint for authenticated request', async () => {
    const response = await fetch(`${baseUrl}/llm/config`, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider: 'openai', apiKey: 'sk-test' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('llm-update-config');
    expect(llmConfigControllerMock.updateConfig).toHaveBeenCalledTimes(1);
  });

  it('should call test-connection endpoint for authenticated request', async () => {
    const response = await fetch(`${baseUrl}/llm/test-connection`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('llm-test-connection');
    expect(llmConfigControllerMock.testConnection).toHaveBeenCalledTimes(1);
  });

  it('should call providers endpoint for authenticated request', async () => {
    const response = await fetch(`${baseUrl}/llm/providers`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('llm-get-providers');
    expect(llmConfigControllerMock.getProviders).toHaveBeenCalledTimes(1);
  });

  it('should validate models payload', async () => {
    const response = await fetch(`${baseUrl}/llm/models`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider: 'invalid-provider' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(llmConfigControllerMock.fetchModels).not.toHaveBeenCalled();
  });

  it('should call models endpoint for authenticated request', async () => {
    const response = await fetch(`${baseUrl}/llm/models`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider: 'openai' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('llm-fetch-models');
    expect(llmConfigControllerMock.fetchModels).toHaveBeenCalledTimes(1);
  });
});
