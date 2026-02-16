import type { Request, Response } from 'express';
import { serverConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import { githubProvider } from './providers/github.provider';
import { googleProvider } from './providers/google.provider';
import { asyncHandler } from '@shared/errors/async-handler';
import { getClientIp, setRefreshTokenCookie } from '@shared/utils';

const logger = createLogger('oauth');
const FRONTEND_URL = serverConfig.frontendUrl;

/**
 * Build callback URL with token data (refresh token sent via cookie, not URL)
 */
function buildCallbackUrl(
  returnUrl: string,
  data: {
    accessToken: string;
    expiresIn: number;
    user: string; // JSON stringified
  }
): string {
  const params = new URLSearchParams({
    accessToken: data.accessToken,
    expiresIn: String(data.expiresIn),
    user: data.user,
    returnUrl,
  });

  return `${FRONTEND_URL}/auth/callback?${params.toString()}`;
}

/**
 * Build error callback URL
 */
function buildErrorCallbackUrl(error: string, returnUrl: string = '/'): string {
  const params = new URLSearchParams({
    error,
    returnUrl,
  });

  return `${FRONTEND_URL}/auth/callback?${params.toString()}`;
}

export const oauthController = {
  /**
   * GET /api/auth/oauth/github
   */
  githubAuth: asyncHandler(async (req: Request, res: Response) => {
    const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '/';
    const authUrl = githubProvider.generateAuthUrl(returnUrl);
    res.redirect(authUrl);
  }),

  /**
   * GET /api/auth/oauth/github/callback
   */
  githubCallback: asyncHandler(async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      const error = req.query.error as string | undefined;

      // Handle OAuth error (user denied access, etc.)
      if (error) {
        res.redirect(buildErrorCallbackUrl(githubProvider.getErrorMessage(error)));
        return;
      }

      // Validate required parameters
      if (!code || !state) {
        res.redirect(buildErrorCallbackUrl('Missing code or state parameter'));
        return;
      }

      const ipAddress = getClientIp(req);
      const userAgent = req.headers['user-agent'] ?? null;

      // Process OAuth callback
      const { authResponse, returnUrl } = await githubProvider.handleCallback(
        code,
        state,
        ipAddress,
        userAgent
      );

      // Redirect to frontend with access token (refresh token sent via cookie)
      setRefreshTokenCookie(res, authResponse.tokens.refreshToken);

      const callbackUrl = buildCallbackUrl(returnUrl, {
        accessToken: authResponse.tokens.accessToken,
        expiresIn: authResponse.tokens.expiresIn,
        user: JSON.stringify(authResponse.user),
      });

      res.redirect(callbackUrl);
    } catch (error) {
      logger.error({ err: error }, 'GitHub OAuth callback error');
      const errorMessage = error instanceof Error ? error.message : 'OAuth authentication failed';
      res.redirect(buildErrorCallbackUrl(errorMessage));
    }
  }),

  /**
   * GET /api/auth/oauth/google
   */
  googleAuth: asyncHandler(async (req: Request, res: Response) => {
    const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '/';
    const authUrl = googleProvider.generateAuthUrl(returnUrl);
    res.redirect(authUrl);
  }),

  /**
   * GET /api/auth/oauth/google/callback
   */
  googleCallback: asyncHandler(async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      const error = req.query.error as string | undefined;

      // Handle OAuth error (user denied access, etc.)
      if (error) {
        res.redirect(buildErrorCallbackUrl(googleProvider.getErrorMessage(error)));
        return;
      }

      // Validate required parameters
      if (!code || !state) {
        res.redirect(buildErrorCallbackUrl('Missing code or state parameter'));
        return;
      }

      const ipAddress = getClientIp(req);
      const userAgent = req.headers['user-agent'] ?? null;

      // Process OAuth callback
      const { authResponse, returnUrl } = await googleProvider.handleCallback(
        code,
        state,
        ipAddress,
        userAgent
      );

      // Redirect to frontend with access token (refresh token sent via cookie)
      setRefreshTokenCookie(res, authResponse.tokens.refreshToken);

      const callbackUrl = buildCallbackUrl(returnUrl, {
        accessToken: authResponse.tokens.accessToken,
        expiresIn: authResponse.tokens.expiresIn,
        user: JSON.stringify(authResponse.user),
      });

      res.redirect(callbackUrl);
    } catch (error) {
      logger.error({ err: error }, 'Google OAuth callback error');
      const errorMessage = error instanceof Error ? error.message : 'OAuth authentication failed';
      res.redirect(buildErrorCallbackUrl(errorMessage));
    }
  }),
};
