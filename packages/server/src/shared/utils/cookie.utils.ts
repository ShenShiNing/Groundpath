import type { Request, Response } from 'express';
import { authConfig, serverConfig } from '@config/env';

const COOKIE_NAME = 'refresh_token';
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

/**
 * Set refresh token as HttpOnly cookie on the response
 */
export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  const cookieOptions = buildRefreshCookieOptions();
  res.cookie(COOKIE_NAME, refreshToken, {
    ...cookieOptions,
    maxAge: authConfig.refreshToken.expiresInSeconds * 1000,
  });
}

/**
 * Clear refresh token cookie (sets maxAge to 0)
 */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, buildRefreshCookieOptions());
}

/**
 * Read refresh token from HttpOnly cookie only.
 */
export function getRefreshTokenFromRequest(req: Request): string | undefined {
  return req.cookies?.[COOKIE_NAME] as string | undefined;
}
