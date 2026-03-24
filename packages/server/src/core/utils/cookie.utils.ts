import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { authConfig, serverConfig } from '@config/env';

export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const CSRF_TOKEN_COOKIE_NAME = 'csrf_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const CSRF_COOKIE_PATH = '/';
const LEGACY_CSRF_COOKIE_PATH = '/api/auth';
const LEGACY_REFRESH_COOKIE_PATH = '/api/auth';

function buildRefreshCookieOptions() {
  const sameSite = authConfig.cookie.sameSite;
  const secure = serverConfig.nodeEnv === 'production' || sameSite === 'none';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: REFRESH_COOKIE_PATH,
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
    path: CSRF_COOKIE_PATH,
    domain: authConfig.cookie.domain,
  } as const;
}

function buildLegacyCsrfCookieOptions() {
  const sameSite = authConfig.cookie.sameSite;
  const secure = serverConfig.nodeEnv === 'production' || sameSite === 'none';

  return {
    httpOnly: false,
    secure,
    sameSite,
    path: LEGACY_CSRF_COOKIE_PATH,
    domain: authConfig.cookie.domain,
  } as const;
}

function buildLegacyRefreshCookieOptions() {
  const sameSite = authConfig.cookie.sameSite;
  const secure = serverConfig.nodeEnv === 'production' || sameSite === 'none';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: LEGACY_REFRESH_COOKIE_PATH,
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
  // Backward compatibility: clear legacy cookies scoped to /api/auth
  // to avoid duplicate cookies with different paths after v1 migration.
  res.clearCookie(CSRF_TOKEN_COOKIE_NAME, buildLegacyCsrfCookieOptions());
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, buildLegacyRefreshCookieOptions());

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
  // Legacy paths (pre-v1 migration)
  res.clearCookie(CSRF_TOKEN_COOKIE_NAME, buildLegacyCsrfCookieOptions());
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, buildLegacyRefreshCookieOptions());
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
