import type { Request, Response } from 'express';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { OAuthExchangeRequest, AuthResponse } from '@knowledge-agent/shared/types';
import { serverConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import { sendSuccessResponse, Errors } from '@shared/errors';
import { systemLogger } from '@shared/logger/system-logger';
import { githubProvider } from './providers/github.provider';
import { googleProvider } from './providers/google.provider';
import { asyncHandler } from '@shared/errors/async-handler';
import { getClientIp, setRefreshTokenCookie } from '@shared/utils';
import { consumeOAuthExchangeCode, createOAuthExchangeCode } from './oauth.service';

const logger = createLogger('oauth');
const FRONTEND_URL = serverConfig.frontendUrl;

/**
 * Build callback URL with token data (refresh token sent via cookie, not URL)
 */
function buildCallbackUrl(
  returnUrl: string,
  data: {
    code: string;
  }
): string {
  const params = new URLSearchParams({
    code: data.code,
    returnUrl,
  });

  return `${FRONTEND_URL}/auth/callback?${params.toString()}`;
}

function sanitizeAuthResponse(authResponse: AuthResponse): AuthResponse {
  return {
    ...authResponse,
    tokens: {
      ...authResponse.tokens,
      refreshToken: '',
      refreshExpiresIn: 0,
    },
  };
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

      // Redirect to frontend with one-time code (refresh token sent via cookie)
      setRefreshTokenCookie(res, authResponse.tokens.refreshToken);
      const exchangeCode = createOAuthExchangeCode(authResponse);

      const callbackUrl = buildCallbackUrl(returnUrl, {
        code: exchangeCode,
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

      // Redirect to frontend with one-time code (refresh token sent via cookie)
      setRefreshTokenCookie(res, authResponse.tokens.refreshToken);
      const exchangeCode = createOAuthExchangeCode(authResponse);

      const callbackUrl = buildCallbackUrl(returnUrl, {
        code: exchangeCode,
      });

      res.redirect(callbackUrl);
    } catch (error) {
      logger.error({ err: error }, 'Google OAuth callback error');
      const errorMessage = error instanceof Error ? error.message : 'OAuth authentication failed';
      res.redirect(buildErrorCallbackUrl(errorMessage));
    }
  }),

  /**
   * POST /api/auth/oauth/exchange
   */
  exchange: asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body as OAuthExchangeRequest;
    if (!code) {
      throw Errors.validation('OAuth exchange code is required');
    }

    const authResponse = consumeOAuthExchangeCode(code);
    if (!authResponse) {
      systemLogger.securityEvent(
        'auth.oauth.exchange.invalid_code',
        'Invalid or expired OAuth exchange code used',
        { codeLength: code.length, ipAddress: getClientIp(req) }
      );
      throw Errors.auth(
        AUTH_ERROR_CODES.TOKEN_INVALID,
        'OAuth exchange code is invalid or expired',
        400
      );
    }

    setRefreshTokenCookie(res, authResponse.tokens.refreshToken);
    sendSuccessResponse(res, sanitizeAuthResponse(authResponse));
  }),
};
