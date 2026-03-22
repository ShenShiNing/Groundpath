import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import { startTestServer, stopTestServer } from './helpers/e2e.helpers';

const {
  rateLimiterMock,
  authenticateMock,
  authenticateRefreshTokenMock,
  requireCsrfProtectionMock,
  authServiceMock,
} = vi.hoisted(() => {
  const passthroughMw: RequestHandler = (_req, _res, next) => next();

  const authenticate: RequestHandler = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader === 'Bearer test-access-token') {
      req.user = {
        sub: 'user-e2e',
        sid: 'sid-e2e',
        email: 'e2e@example.com',
        username: 'e2e_user',
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

  const authenticateRefreshToken: RequestHandler = (req, res, next) => {
    const cookie = req.headers.cookie ?? '';
    if (cookie.includes('refreshToken=test-refresh-token')) {
      req.user = {
        sub: 'user-e2e',
        sid: 'sid-e2e',
        email: 'e2e@example.com',
        username: 'e2e_user',
        status: 'active' as const,
        emailVerified: true,
      };
      next();
      return;
    }
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED_REFRESH', message: 'Missing refresh token' },
    });
  };

  const requireCsrf: RequestHandler = (req, res, next) => {
    if (req.headers['x-csrf-token']) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      error: { code: 'CSRF_TOKEN_REQUIRED', message: 'CSRF token missing' },
    });
  };

  return {
    rateLimiterMock: vi.fn(passthroughMw),
    authenticateMock: vi.fn(authenticate),
    authenticateRefreshTokenMock: vi.fn(authenticateRefreshToken),
    requireCsrfProtectionMock: vi.fn(requireCsrf),
    authServiceMock: {
      register: vi.fn(async (data: Record<string, unknown>) => ({
        user: { id: 'user-e2e', email: data.email, username: data.username },
        tokens: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          csrfToken: 'test-csrf',
        },
      })),
      login: vi.fn(async (_data: Record<string, unknown>) => ({
        user: { id: 'user-e2e', email: 'e2e@example.com', username: 'e2e_user' },
        tokens: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          csrfToken: 'test-csrf',
        },
      })),
      refreshTokenPair: vi.fn(async () => ({
        tokens: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          csrfToken: 'new-csrf',
        },
      })),
      logout: vi.fn(async () => undefined),
    },
  };
});

vi.mock('@modules/auth/controllers/auth.controller', async () => {
  const { asyncHandler } = await import('@core/errors/async-handler');
  const { sendSuccessResponse } = await import('@core/errors');
  const { HTTP_STATUS } = await import('@groundpath/shared');

  return {
    authController: {
      register: asyncHandler(async (req, res) => {
        const result = await authServiceMock.register(req.body);
        res.cookie('refreshToken', result.tokens.refreshToken, { httpOnly: true });
        sendSuccessResponse(res, result, HTTP_STATUS.CREATED);
      }),
      login: asyncHandler(async (req, res) => {
        const result = await authServiceMock.login(req.body);
        res.cookie('refreshToken', result.tokens.refreshToken, { httpOnly: true });
        sendSuccessResponse(res, result);
      }),
      refresh: asyncHandler(async (_req, res) => {
        const result = await authServiceMock.refreshTokenPair();
        sendSuccessResponse(res, result);
      }),
      logout: asyncHandler(async (_req, res) => {
        await authServiceMock.logout();
        res.clearCookie('refreshToken');
        sendSuccessResponse(res, { message: 'Logged out' });
      }),
      me: asyncHandler(async (req, res) => {
        sendSuccessResponse(res, { user: req.user });
      }),
      sessions: vi.fn((_req, res) =>
        res.status(200).json({ success: true, data: { sessions: [] } })
      ),
      revokeSession: vi.fn((_req, res) => res.status(200).json({ success: true })),
      changePassword: vi.fn((_req, res) => res.status(200).json({ success: true })),
      logoutAll: vi.fn((_req, res) => res.status(200).json({ success: true })),
      resetPassword: vi.fn((_req, res) => res.status(200).json({ success: true })),
      registerWithCode: vi.fn((_req, res) => res.status(201).json({ success: true })),
    },
  };
});

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
    authenticateRefreshToken: authenticateRefreshTokenMock,
    requireCsrfProtection: requireCsrfProtectionMock,
    registerRateLimiter: rateLimiterMock,
    loginRateLimiter: rateLimiterMock,
    refreshRateLimiter: rateLimiterMock,
    generalRateLimiter: rateLimiterMock,
    passwordResetRateLimiter: rateLimiterMock,
  };
});

import authRoutes from '@modules/auth/auth.routes';

describe('E2E Smoke: Auth Journey', () => {
  let server: Server;
  let baseUrl: string;

  // Journey state shared across ordered tests
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const result = await startTestServer((app) => {
      app.use('/api/auth', authRoutes);
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

  // Step 1: Register
  it('should register a new user and receive tokens', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'e2e_user',
        email: 'e2e@example.com',
        password: 'SecurePass123',
        confirmPassword: 'SecurePass123',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);

    const data = body.data as Record<string, unknown>;
    const tokens = data.tokens as Record<string, string>;
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();

    accessToken = tokens.accessToken!;
    refreshToken = tokens.refreshToken!;
  });

  // Step 2: Register with invalid data should fail validation
  it('should reject registration with invalid email', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'bad',
        email: 'not-an-email',
        password: '123',
        confirmPassword: '456',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    const error = body.error as Record<string, unknown>;
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  // Step 3: Login
  it('should login with valid credentials', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'e2e@example.com',
        password: 'SecurePass123',
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);

    const data = body.data as Record<string, unknown>;
    const tokens = data.tokens as Record<string, string>;
    accessToken = tokens.accessToken!;
    refreshToken = tokens.refreshToken!;
  });

  // Step 4: Access protected route /me
  it('should access /me with valid access token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  // Step 5: Reject /me without token
  it('should reject /me without access token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);

    expect(response.status).toBe(401);
  });

  // Step 6: Refresh token
  it('should refresh token pair', async () => {
    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'x-csrf-token': 'test-csrf' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  // Step 7: Logout
  it('should logout with valid refresh token and csrf', async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'x-csrf-token': 'test-csrf',
        cookie: `refreshToken=${refreshToken}`,
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
  });

  // Step 8: Logout without CSRF should fail
  it('should reject logout without CSRF token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: `refreshToken=${refreshToken}`,
      },
    });

    expect(response.status).toBe(403);
  });
});
