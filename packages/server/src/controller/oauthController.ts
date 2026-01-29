import type { Request, Response } from 'express';
import { githubOAuthService } from '../services/githubOAuthService';
import { googleOAuthService } from '../services/googleOAuthService';
import { handleError } from '../utils/errors';
import { getClientIp } from '../utils/requestUtils';

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
 * Map GitHub OAuth error codes to user-friendly messages
 */
function getGitHubErrorMessage(error: string): string {
  const errorMessages: Record<string, string> = {
    access_denied: 'You cancelled the GitHub authorization',
    redirect_uri_mismatch: 'OAuth configuration error. Please contact support.',
    application_suspended: 'This application has been suspended',
    bad_verification_code: 'Authorization code expired. Please try again.',
  };

  return errorMessages[error] || 'GitHub authorization failed. Please try again.';
}

/**
 * Map Google OAuth error codes to user-friendly messages
 */
function getGoogleErrorMessage(error: string): string {
  const errorMessages: Record<string, string> = {
    access_denied: 'You cancelled the Google authorization',
    redirect_uri_mismatch: 'OAuth configuration error. Please contact support.',
    invalid_request: 'Invalid request. Please try again.',
    unauthorized_client: 'This application is not authorized for Google login.',
    unsupported_response_type: 'OAuth configuration error. Please contact support.',
    invalid_scope: 'OAuth configuration error. Please contact support.',
    server_error: 'Google server error. Please try again later.',
    temporarily_unavailable: 'Google is temporarily unavailable. Please try again later.',
  };

  return errorMessages[error] || 'Google authorization failed. Please try again.';
}

/**
 * OAuth controller handlers
 */
export const oauthController = {
  /**
   * GET /api/auth/github
   * Initiate GitHub OAuth flow
   */
  async githubAuth(req: Request, res: Response): Promise<void> {
    try {
      const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '/';

      const authUrl = githubOAuthService.generateAuthUrl(returnUrl);
      res.redirect(authUrl);
    } catch (error) {
      console.error('[OAuth] GitHub auth error:', error);
      handleError(error, res, 'OAuth controller');
    }
  },

  /**
   * GET /api/auth/github/callback
   * Handle GitHub OAuth callback
   */
  async githubCallback(req: Request, res: Response): Promise<void> {
    try {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      const error = req.query.error as string | undefined;

      // Handle OAuth error (user denied access, etc.)
      if (error) {
        res.redirect(buildErrorCallbackUrl(getGitHubErrorMessage(error)));
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
      const { authResponse, returnUrl } = await githubOAuthService.handleCallback(
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
   * GET /api/auth/google
   * Initiate Google OAuth flow
   */
  async googleAuth(req: Request, res: Response): Promise<void> {
    try {
      const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '/';

      const authUrl = googleOAuthService.generateAuthUrl(returnUrl);
      res.redirect(authUrl);
    } catch (error) {
      console.error('[OAuth] Google auth error:', error);
      handleError(error, res, 'OAuth controller');
    }
  },

  /**
   * GET /api/auth/google/callback
   * Handle Google OAuth callback
   */
  async googleCallback(req: Request, res: Response): Promise<void> {
    try {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      const error = req.query.error as string | undefined;

      // Handle OAuth error (user denied access, etc.)
      if (error) {
        res.redirect(buildErrorCallbackUrl(getGoogleErrorMessage(error)));
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
      const { authResponse, returnUrl } = await googleOAuthService.handleCallback(
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
