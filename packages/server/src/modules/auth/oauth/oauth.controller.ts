import type { Request, Response } from 'express';
import { githubProvider } from './providers/github.provider';
import { googleProvider } from './providers/google.provider';
import { handleError } from '@shared/errors/errors';
import { getClientIp } from '@shared/utils/requestUtils';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Build callback URL with token data (fragment-based for security)
 */
function buildCallbackUrl(
  returnUrl: string,
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
    user: string; // JSON stringified
  }
): string {
  const params = new URLSearchParams({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: String(data.expiresIn),
    refreshExpiresIn: String(data.refreshExpiresIn),
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

/**
 * OAuth controller handlers
 */
export const oauthController = {
  /**
   * GET /api/auth/oauth/github
   * Initiate GitHub OAuth flow
   */
  async githubAuth(req: Request, res: Response): Promise<void> {
    try {
      const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '/';

      const authUrl = githubProvider.generateAuthUrl(returnUrl);
      res.redirect(authUrl);
    } catch (error) {
      console.error('[OAuth] GitHub auth error:', error);
      handleError(error, res, 'OAuth controller');
    }
  },

  /**
   * GET /api/auth/oauth/github/callback
   * Handle GitHub OAuth callback
   */
  async githubCallback(req: Request, res: Response): Promise<void> {
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

      // Redirect to frontend with tokens
      const callbackUrl = buildCallbackUrl(returnUrl, {
        accessToken: authResponse.tokens.accessToken,
        refreshToken: authResponse.tokens.refreshToken,
        expiresIn: authResponse.tokens.expiresIn,
        refreshExpiresIn: authResponse.tokens.refreshExpiresIn,
        user: JSON.stringify(authResponse.user),
      });

      res.redirect(callbackUrl);
    } catch (error) {
      console.error('GitHub OAuth callback error:', error);

      // Extract error message
      const errorMessage = error instanceof Error ? error.message : 'OAuth authentication failed';

      res.redirect(buildErrorCallbackUrl(errorMessage));
    }
  },

  /**
   * GET /api/auth/oauth/google
   * Initiate Google OAuth flow
   */
  async googleAuth(req: Request, res: Response): Promise<void> {
    try {
      const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '/';

      const authUrl = googleProvider.generateAuthUrl(returnUrl);
      res.redirect(authUrl);
    } catch (error) {
      console.error('[OAuth] Google auth error:', error);
      handleError(error, res, 'OAuth controller');
    }
  },

  /**
   * GET /api/auth/oauth/google/callback
   * Handle Google OAuth callback
   */
  async googleCallback(req: Request, res: Response): Promise<void> {
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

      // Redirect to frontend with tokens
      const callbackUrl = buildCallbackUrl(returnUrl, {
        accessToken: authResponse.tokens.accessToken,
        refreshToken: authResponse.tokens.refreshToken,
        expiresIn: authResponse.tokens.expiresIn,
        refreshExpiresIn: authResponse.tokens.refreshExpiresIn,
        user: JSON.stringify(authResponse.user),
      });

      res.redirect(callbackUrl);
    } catch (error) {
      console.error('Google OAuth callback error:', error);

      // Extract error message
      const errorMessage = error instanceof Error ? error.message : 'OAuth authentication failed';

      res.redirect(buildErrorCallbackUrl(errorMessage));
    }
  },
};
