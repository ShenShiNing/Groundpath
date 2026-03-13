import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  CSRF_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  getCsrfTokenFromRequest,
} from '@core/utils/cookie.utils';

describe('cookie.utils', () => {
  it('should set refresh token cookie with secure options', () => {
    const res = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as Response;

    setRefreshTokenCookie(res, 'refresh-token-value');

    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith(
      CSRF_TOKEN_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'strict',
        path: '/api/auth',
      })
    );

    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE_NAME,
      'refresh-token-value',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/auth',
      })
    );
    expect(res.cookie).toHaveBeenCalledWith(
      CSRF_TOKEN_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'strict',
        path: '/',
      })
    );
  });

  it('should clear refresh token cookie with matching options', () => {
    const res = {
      clearCookie: vi.fn(),
    } as unknown as Response;

    clearRefreshTokenCookie(res);

    expect(res.clearCookie).toHaveBeenCalledTimes(3);
    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/auth',
      })
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      CSRF_TOKEN_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'strict',
        path: '/',
      })
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      CSRF_TOKEN_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'strict',
        path: '/api/auth',
      })
    );
  });

  it('should read refresh token from cookie', () => {
    const req = {
      cookies: {
        [REFRESH_TOKEN_COOKIE_NAME]: 'cookie-token',
      },
    } as unknown as Request;

    expect(getRefreshTokenFromRequest(req)).toBe('cookie-token');
  });

  it('should read csrf token from cookie', () => {
    const req = {
      cookies: {
        [CSRF_TOKEN_COOKIE_NAME]: 'csrf-cookie-token',
      },
    } as unknown as Request;

    expect(getCsrfTokenFromRequest(req)).toBe('csrf-cookie-token');
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
