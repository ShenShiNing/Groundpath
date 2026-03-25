import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ERROR_CODES } from '@groundpath/shared';

const verifyAccessTokenMock = vi.fn();
const getTokenIssuedAtMock = vi.fn();
const findAccessAuthStateByIdMock = vi.fn();
const findValidByIdMock = vi.fn();

vi.mock('@config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@config/env')>();

  return {
    ...actual,
    authConfig: {
      ...actual.authConfig,
      accessToken: {
        ...actual.authConfig.accessToken,
        revocationClockSkewSeconds: 10,
      },
    },
  };
});

vi.mock('@core/utils/jwt.utils', () => ({
  extractBearerToken: (authorization?: string) =>
    authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null,
  getTokenIssuedAt: getTokenIssuedAtMock,
  verifyAccessToken: verifyAccessTokenMock,
  verifyRefreshToken: vi.fn(),
}));

vi.mock('@core/utils/cookie.utils', () => ({
  getRefreshTokenFromRequest: vi.fn(),
}));

vi.mock('@core/utils/refresh-token.utils', () => ({
  isStoredRefreshTokenMatch: vi.fn(),
}));

vi.mock('@modules/auth/repositories/refresh-token.repository', () => ({
  refreshTokenRepository: {
    findValidById: findValidByIdMock,
  },
}));

vi.mock('@modules/user/repositories/user.repository', () => ({
  userRepository: {
    findAccessAuthStateById: findAccessAuthStateByIdMock,
  },
}));

const { optionalAuthenticate } = await import('@core/middleware/auth.middleware');

function createResponseMock(): Response {
  const res = {
    req: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  return res as unknown as Response;
}

describe('optionalAuthenticate', () => {
  const payload = {
    sub: 'user-1',
    sid: 'session-1',
    email: 'user@example.com',
    username: 'user',
    status: 'active' as const,
    emailVerified: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows anonymous requests when no bearer token is provided', async () => {
    const req = { headers: {} } as Request;
    const res = createResponseMock();
    const next = vi.fn() as unknown as NextFunction;

    await optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(verifyAccessTokenMock).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when the access token is valid but the session is no longer active', async () => {
    const req = { headers: { authorization: 'Bearer access-token' } } as Request;
    const res = createResponseMock();
    const next = vi.fn() as unknown as NextFunction;

    verifyAccessTokenMock.mockReturnValue(payload);
    getTokenIssuedAtMock.mockReturnValue(1_710_000_000);
    findAccessAuthStateByIdMock.mockResolvedValue({
      status: 'active',
      tokenValidAfterEpoch: null,
    });
    findValidByIdMock.mockResolvedValue(null);

    await optionalAuthenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: AUTH_ERROR_CODES.TOKEN_REVOKED,
        message: 'Session has been revoked',
      },
    });
  });

  it('attaches req.user when the provided token and session are both valid', async () => {
    const req = { headers: { authorization: 'Bearer access-token' } } as Request;
    const res = createResponseMock();
    const next = vi.fn() as unknown as NextFunction;

    verifyAccessTokenMock.mockReturnValue(payload);
    getTokenIssuedAtMock.mockReturnValue(1_710_000_000);
    findAccessAuthStateByIdMock.mockResolvedValue({
      status: 'active',
      tokenValidAfterEpoch: null,
    });
    findValidByIdMock.mockResolvedValue({
      id: payload.sid,
      userId: payload.sub,
    });

    await optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(payload);
    expect(res.status).not.toHaveBeenCalled();
  });
});
