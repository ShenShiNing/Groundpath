import type { Request, Response } from 'express';
import { authConfig, serverConfig } from '@config/env';

const COOKIE_NAME = 'refresh_token';

/**
 * Set refresh token as HttpOnly cookie on the response
 */
export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: serverConfig.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: authConfig.refreshToken.expiresInSeconds * 1000,
  });
}

/**
 * Clear refresh token cookie (sets maxAge to 0)
 */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: serverConfig.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
}

/**
 * Read refresh token from cookie, falling back to request body
 */
export function getRefreshTokenFromRequest(req: Request): string | undefined {
  return (req.cookies?.[COOKIE_NAME] as string | undefined) || req.body?.refreshToken;
}
