import type { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { ApiResponse } from '@knowledge-agent/shared';
import { refreshRequestSchema } from '@knowledge-agent/shared/schemas';
import { AuthError } from '../utils/errors';
import { extractBearerToken, verifyAccessToken, verifyRefreshToken } from '../utils/jwtUtils';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository';

/**
 * Middleware to authenticate requests using JWT access token
 * Attaches user payload to request if valid
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw new AuthError(AUTH_ERROR_CODES.MISSING_TOKEN, 'Authorization token required');
    }

    // Verify and decode access token
    const payload = verifyAccessToken(token);

    // Check if user is banned
    if (payload.status === 'banned') {
      throw new AuthError(AUTH_ERROR_CODES.USER_BANNED, 'Your account has been banned', 403);
    }

    // Attach user to request
    req.user = payload;
    next();
  } catch (error) {
    handleAuthError(error, res);
  }
}

/**
 * Middleware to optionally authenticate requests
 * Attaches user payload if token is valid, but doesn't fail if no token
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (token) {
      const payload = verifyAccessToken(token);
      if (payload.status !== 'banned') {
        req.user = payload;
      }
    }
    next();
  } catch {
    // Silently continue without authentication
    next();
  }
}

/**
 * Middleware to authenticate using refresh token from body
 * Used for refresh and logout endpoints
 */
export async function authenticateRefreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = refreshRequestSchema.safeParse(req.body);
    if (!result.success) {
      throw new AuthError(AUTH_ERROR_CODES.MISSING_TOKEN, 'Refresh token required');
    }
    const { refreshToken } = result.data;

    // Verify JWT signature
    const payload = verifyRefreshToken(refreshToken);

    // Verify token exists in database and is valid
    const storedToken = await refreshTokenRepository.findValidById(payload.jti);
    if (!storedToken || storedToken.token !== refreshToken) {
      throw new AuthError(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Refresh token has been revoked');
    }

    // Attach refresh context to request
    req.refreshContext = {
      sub: payload.sub,
      jti: payload.jti,
    };
    next();
  } catch (error) {
    handleAuthError(error, res);
  }
}

/**
 * Handle authentication errors and send appropriate response
 */
function handleAuthError(error: unknown, res: Response): void {
  if (error instanceof AuthError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
    res.status(error.statusCode).json(response);
    return;
  }

  // Unexpected error
  console.error('Auth middleware error:', error);
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
  res.status(HTTP_STATUS.INTERNAL_ERROR).json(response);
}
