import type { Request, Response, NextFunction } from 'express';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { refreshRequestSchema } from '@knowledge-agent/shared/schemas';
import { Errors, handleError } from '../errors';
import { extractBearerToken, verifyAccessToken, verifyRefreshToken } from '../utils/jwt.utils';
import { refreshTokenRepository } from '@modules/auth';

/**
 * Middleware to authenticate requests using JWT access token
 * Attaches user payload to request if valid
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw Errors.auth(AUTH_ERROR_CODES.MISSING_TOKEN, 'Authorization token required');
    }

    // Verify and decode access token
    const payload = verifyAccessToken(token);

    // Check if user is banned
    if (payload.status === 'banned') {
      throw Errors.auth(AUTH_ERROR_CODES.USER_BANNED, 'Your account has been banned', 403);
    }

    // Attach user to request
    req.user = payload;
    next();
  } catch (error) {
    handleError(error, res, 'Auth middleware');
  }
}

/**
 * Middleware to optionally authenticate requests
 * Attaches user payload if token is valid, but doesn't fail if no token
 */
export async function optionalAuthenticate(
  req: Request,
  _res: Response,
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
      throw Errors.auth(AUTH_ERROR_CODES.MISSING_TOKEN, 'Refresh token required');
    }
    const { refreshToken } = result.data;

    // Verify JWT signature
    const payload = verifyRefreshToken(refreshToken);

    // Verify token exists in database and is valid
    const storedToken = await refreshTokenRepository.findValidById(payload.jti);
    if (!storedToken || storedToken.token !== refreshToken) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Refresh token has been revoked');
    }

    // Attach refresh context to request
    req.refreshContext = {
      sub: payload.sub,
      jti: payload.jti,
    };
    next();
  } catch (error) {
    handleError(error, res, 'Auth middleware');
  }
}
