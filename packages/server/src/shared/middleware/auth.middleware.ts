import type { Request, Response, NextFunction } from 'express';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { Errors, handleError } from '../errors';
import {
  extractBearerToken,
  getTokenIssuedAt,
  verifyAccessToken,
  verifyRefreshToken,
} from '../utils/jwt.utils';
import { getRefreshTokenFromRequest } from '../utils/cookie.utils';
import { isStoredRefreshTokenMatch } from '../utils/refresh-token.utils';
import { refreshTokenRepository } from '@modules/auth/repositories/refresh-token.repository';
import { userRepository } from '@modules/user/repositories/user.repository';

function isTokenRevokedByTimestamp(tokenIatSeconds: number, tokenValidAfter: Date | null): boolean {
  if (!tokenValidAfter) {
    return false;
  }
  return tokenIatSeconds * 1000 <= tokenValidAfter.getTime();
}

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
    const tokenIat = getTokenIssuedAt(token);
    if (!tokenIat) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid access token');
    }

    const authState = await userRepository.findAccessAuthStateById(payload.sub);
    if (!authState) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }

    if (authState.status === 'banned') {
      throw Errors.auth(AUTH_ERROR_CODES.USER_BANNED, 'Your account has been banned', 403);
    }
    if (isTokenRevokedByTimestamp(tokenIat, authState.tokenValidAfter)) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Access token has been revoked');
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
      const tokenIat = getTokenIssuedAt(token);
      const authState = tokenIat ? await userRepository.findAccessAuthStateById(payload.sub) : undefined;
      if (
        tokenIat &&
        authState &&
        authState.status !== 'banned' &&
        !isTokenRevokedByTimestamp(tokenIat, authState.tokenValidAfter)
      ) {
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
 * Middleware to authenticate using refresh token from HttpOnly cookie
 * Used for refresh and logout endpoints
 */
export async function authenticateRefreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw Errors.auth(AUTH_ERROR_CODES.MISSING_TOKEN, 'Refresh token required');
    }

    // Verify JWT signature
    const payload = verifyRefreshToken(refreshToken);

    // Verify token exists in database and is valid
    const storedToken = await refreshTokenRepository.findValidById(payload.jti);
    if (!storedToken || !isStoredRefreshTokenMatch(storedToken.token, refreshToken)) {
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
