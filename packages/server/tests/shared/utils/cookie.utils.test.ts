import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
} from '@shared/utils/cookie.utils';

describe('cookie.utils', () => {
  it('should set refresh token cookie with secure options', () => {
    const res = {
      cookie: vi.fn(),
    } as unknown as Response;

    setRefreshTokenCookie(res, 'refresh-token-value');

    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token-value',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/auth',
      })
    );
  });

  it('should clear refresh token cookie with matching options', () => {
    const res = {
      clearCookie: vi.fn(),
    } as unknown as Response;

    clearRefreshTokenCookie(res);

    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/auth',
      })
    );
  });

  it('should read refresh token from cookie', () => {
    const req = {
      cookies: {
        refresh_token: 'cookie-token',
      },
    } as unknown as Request;

    expect(getRefreshTokenFromRequest(req)).toBe('cookie-token');
  });

  it('should not read refresh token from request body', () => {
    const req = {
      body: {
        refreshToken: 'body-token',
      },
      cookies: {},
    } as unknown as Request;

    expect(getRefreshTokenFromRequest(req)).toBeUndefined();
  });
});
