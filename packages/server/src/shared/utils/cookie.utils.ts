import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { authConfig, serverConfig } from '@config/env';

export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const CSRF_TOKEN_COOKIE_NAME = 'csrf_token';
const COOKIE_PATH = '/api/auth';

function buildRefreshCookieOptions() {
  const sameSite = authConfig.cookie.sameSite;
  const secure = serverConfig.nodeEnv === 'production' || sameSite === 'none';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: COOKIE_PATH,
    domain: authConfig.cookie.domain,
  } as const;
}

function buildCsrfCookieOptions() {
  const sameSite = authConfig.cookie.sameSite;
  const secure = serverConfig.nodeEnv === 'production' || sameSite === 'none';

  return {
    httpOnly: false,
    secure,
    sameSite,
    path: COOKIE_PATH,
    domain: authConfig.cookie.domain,
  } as const;
}

function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Set refresh token and CSRF token cookies on the response.
 */
export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  const cookieOptions = buildRefreshCookieOptions();
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...cookieOptions,
    maxAge: authConfig.refreshToken.expiresInSeconds * 1000,
  });

  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_TOKEN_COOKIE_NAME, csrfToken, {
    ...buildCsrfCookieOptions(),
    maxAge: authConfig.refreshToken.expiresInSeconds * 1000,
  });
}

/**
 * Clear refresh token and CSRF token cookies.
 */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, buildRefreshCookieOptions());
  res.clearCookie(CSRF_TOKEN_COOKIE_NAME, buildCsrfCookieOptions());
}

/**
 * Read refresh token from HttpOnly cookie only.
 */
export function getRefreshTokenFromRequest(req: Request): string | undefined {
  return req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;
}

/**
 * Read CSRF token from cookie.
 */
export function getCsrfTokenFromRequest(req: Request): string | undefined {
  return req.cookies?.[CSRF_TOKEN_COOKIE_NAME] as string | undefined;
}
