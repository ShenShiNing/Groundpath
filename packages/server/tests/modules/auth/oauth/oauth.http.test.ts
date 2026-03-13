import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const { requireCsrfProtectionMock, oauthControllerMock } = vi.hoisted(() => {
  const requireCsrfProtection: RequestHandler = (req, res, next) => {
    if (typeof req.headers['x-csrf-token'] === 'string' && req.headers['x-csrf-token'].length > 0) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      error: { code: 'CSRF_TOKEN_REQUIRED', message: 'CSRF token missing' },
    });
  };

  return {
    requireCsrfProtectionMock: vi.fn(requireCsrfProtection),
    oauthControllerMock: {
      githubAuth: vi.fn((_req, res) =>
        res.redirect('https://oauth.example.test/github?state=github-state')
      ),
      githubCallback: vi.fn((req, res) => {
        if (!req.query.code || !req.query.state) {
          res.redirect('/auth/callback?error=Missing%20code%20or%20state%20parameter');
          return;
        }
        res.redirect('/auth/callback?code=ok&returnUrl=%2Fdashboard');
      }),
      googleAuth: vi.fn((_req, res) =>
        res.redirect('https://oauth.example.test/google?state=google-state')
      ),
      googleCallback: vi.fn((req, res) => {
        if (req.query.error) {
          res.redirect('/auth/callback?error=Google%20oauth%20failed');
          return;
        }
        res.redirect('/auth/callback?code=ok&returnUrl=%2F');
      }),
      exchange: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'exchange' })),
    },
  };
});

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    requireCsrfProtection: requireCsrfProtectionMock,
  };
});

vi.mock('@modules/auth/oauth/oauth.controller', () => ({
  oauthController: oauthControllerMock,
}));

import oauthRoutes from '@modules/auth/oauth/oauth.routes';

describe('oauth.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/oauth', oauthRoutes);

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

  it('should redirect to provider auth url on github auth entry', async () => {
    const response = await fetch(`${baseUrl}/oauth/github`, { redirect: 'manual' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('oauth.example.test/github');
    expect(oauthControllerMock.githubAuth).toHaveBeenCalledTimes(1);
  });

  it('should redirect with error when callback misses code/state', async () => {
    const response = await fetch(`${baseUrl}/oauth/github/callback?state=only-state`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain(
      'error=Missing%20code%20or%20state%20parameter'
    );
    expect(oauthControllerMock.githubCallback).toHaveBeenCalledTimes(1);
  });

  it('should enforce csrf on exchange endpoint', async () => {
    const response = await fetch(`${baseUrl}/oauth/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'exchange-code' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('CSRF_TOKEN_REQUIRED');
    expect(oauthControllerMock.exchange).not.toHaveBeenCalled();
  });

  it('should validate exchange body after csrf passes', async () => {
    const response = await fetch(`${baseUrl}/oauth/exchange`, {
      method: 'POST',
      headers: {
        'x-csrf-token': 'csrf-ok',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code: '' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(oauthControllerMock.exchange).not.toHaveBeenCalled();
  });

  it('should call exchange controller for valid payload', async () => {
    const response = await fetch(`${baseUrl}/oauth/exchange`, {
      method: 'POST',
      headers: {
        'x-csrf-token': 'csrf-ok',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code: 'valid-exchange-code' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('exchange');
    expect(oauthControllerMock.exchange).toHaveBeenCalledTimes(1);
  });
});
