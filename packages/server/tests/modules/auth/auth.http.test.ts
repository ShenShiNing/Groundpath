import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';

const {
  registerRateLimiterMock,
  loginRateLimiterMock,
  refreshRateLimiterMock,
  generalRateLimiterMock,
  passwordResetRateLimiterMock,
  authenticateMock,
  authenticateRefreshTokenMock,
  requireCsrfProtectionMock,
  authControllerMock,
} = vi.hoisted(() => {
  const passthrough: RequestHandler = (_req, _res, next) => next();

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

  const authenticateRefreshToken: RequestHandler = (req, res, next) => {
    const cookie = req.headers.cookie ?? '';
    if (cookie.includes('refreshToken=valid-refresh')) {
      next();
      return;
    }
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED_REFRESH', message: 'Missing or invalid refresh token' },
    });
  };

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
    registerRateLimiterMock: vi.fn(passthrough),
    loginRateLimiterMock: vi.fn(passthrough),
    refreshRateLimiterMock: vi.fn(passthrough),
    generalRateLimiterMock: vi.fn(passthrough),
    passwordResetRateLimiterMock: vi.fn(passthrough),
    authenticateMock: vi.fn(authenticate),
    authenticateRefreshTokenMock: vi.fn(authenticateRefreshToken),
    requireCsrfProtectionMock: vi.fn(requireCsrfProtection),
    authControllerMock: {
      register: vi.fn((_req, res) => res.status(201).json({ success: true, route: 'register' })),
      registerWithCode: vi.fn((_req, res) =>
        res.status(201).json({ success: true, route: 'register-with-code' })
      ),
      login: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'login' })),
      refresh: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'refresh' })),
      resetPassword: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'reset-password' })
      ),
      logout: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'logout' })),
      changePassword: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'change-password' })
      ),
      logoutAll: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'logout-all' })),
      me: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'me' })),
      sessions: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'sessions' })),
      revokeSession: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'revoke-session' })
      ),
    },
  };
});

vi.mock('@modules/auth/controllers/auth.controller', () => ({
  authController: authControllerMock,
}));

vi.mock('@shared/middleware', async () => {
  const actual = await vi.importActual<typeof import('@shared/middleware')>('@shared/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    authenticateRefreshToken: authenticateRefreshTokenMock,
    registerRateLimiter: registerRateLimiterMock,
    loginRateLimiter: loginRateLimiterMock,
    refreshRateLimiter: refreshRateLimiterMock,
    generalRateLimiter: generalRateLimiterMock,
    passwordResetRateLimiter: passwordResetRateLimiterMock,
    requireCsrfProtection: requireCsrfProtectionMock,
  };
});

import authRoutes from '@modules/auth/auth.routes';

describe('auth.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);

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

  it('should reject invalid register body with VALIDATION_ERROR', async () => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'bad-email', password: '123456' }),
    });
    const body: any = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(authControllerMock.register).not.toHaveBeenCalled();
  });

  it('should pass valid register body to controller', async () => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'tester_01',
        email: 'tester@example.com',
        password: 'abc12345',
        confirmPassword: 'abc12345',
      }),
    });
    const body: any = await response.json();

    expect(response.status).toBe(201);
    expect(body.route).toBe('register');
    expect(authControllerMock.register).toHaveBeenCalledTimes(1);
  });

  it('should enforce csrf before refresh-token auth on logout', async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
    });
    const body: any = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('CSRF_TOKEN_REQUIRED');
    expect(authenticateRefreshTokenMock).not.toHaveBeenCalled();
    expect(authControllerMock.logout).not.toHaveBeenCalled();
  });

  it('should reject logout when csrf exists but refresh token is missing', async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'x-csrf-token': 'csrf-ok',
      },
    });
    const body: any = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED_REFRESH');
    expect(authenticateRefreshTokenMock).toHaveBeenCalledTimes(1);
    expect(authControllerMock.logout).not.toHaveBeenCalled();
  });

  it('should allow logout when csrf and refresh token are both valid', async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'x-csrf-token': 'csrf-ok',
        cookie: 'refreshToken=valid-refresh',
      },
    });
    const body: any = await response.json();

    expect(response.status).toBe(200);
    expect(body.route).toBe('logout');
    expect(authControllerMock.logout).toHaveBeenCalledTimes(1);
  });

  it('should require access token for /me', async () => {
    const response = await fetch(`${baseUrl}/auth/me`);
    const body: any = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(authControllerMock.me).not.toHaveBeenCalled();
  });

  it('should validate change-password payload after auth', async () => {
    const response = await fetch(`${baseUrl}/auth/password`, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        oldPassword: 'old-pass',
        newPassword: 'new-password-123',
        confirmPassword: 'not-match',
      }),
    });
    const body: any = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(authControllerMock.changePassword).not.toHaveBeenCalled();
  });
});
