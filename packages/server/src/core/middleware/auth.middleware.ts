import type { Request, Response, NextFunction } from 'express';
import { AUTH_ERROR_CODES } from '@groundpath/shared';
import { authConfig } from '@config/env';
import type { AccessTokenPayload } from '../types';
import { Errors, handleError } from '../errors';
import {
  extractBearerToken,
  getTokenIssuedAt,
  verifyAccessToken,
  verifyRefreshToken,
} from '../utils/jwt.utils';
import { getRefreshTokenFromRequest } from '../utils/cookie.utils';
import { isStoredRefreshTokenMatch } from '../utils/refresh-token.utils';
import { refreshTokenRepository } from '@modules/auth/public/sessions';
import { userRepository } from '@modules/user/public/repositories';

export function isTokenRevokedByTimestamp(
  tokenIatSeconds: number,
  tokenValidAfterEpoch: number | null
): boolean {
  if (tokenValidAfterEpoch == null) {
    return false;
  }

  // JWT iat uses the app server clock while tokenValidAfterEpoch comes from
  // MySQL UNIX_TIMESTAMP() which is always UTC epoch seconds.
  // Allow a small skew so freshly re-issued tokens after password change/logout-all
  // are not rejected when the two clocks differ by a few seconds.
  return tokenIatSeconds + authConfig.accessToken.revocationClockSkewSeconds < tokenValidAfterEpoch;
}

async function isSessionActiveForUser(sessionId: string, userId: string): Promise<boolean> {
  const session = await refreshTokenRepository.findValidById(sessionId);
  if (!session) {
    return false;
  }
  return session.userId === userId;
}

async function validateAccessTokenSession(token: string): Promise<AccessTokenPayload> {
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
  if (isTokenRevokedByTimestamp(tokenIat, authState.tokenValidAfterEpoch)) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Access token has been revoked');
  }
  if (!(await isSessionActiveForUser(payload.sid, payload.sub))) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Session has been revoked');
  }

  return payload;
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

    const payload = await validateAccessTokenSession(token);

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
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    next();
    return;
  }

  try {
    req.user = await validateAccessTokenSession(token);
    next();
  } catch (error) {
    handleError(error, res, 'Optional auth middleware');
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
    const storedToken = await refreshTokenRepository.findValidById(payload.sid);
    if (!storedToken || !isStoredRefreshTokenMatch(storedToken.token, refreshToken)) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_REVOKED, 'Refresh token has been revoked');
    }
    if (storedToken.userId !== payload.sub) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Refresh token user mismatch');
    }

    // Attach refresh context to request
    req.refreshContext = {
      sub: payload.sub,
      sid: payload.sid,
      jti: payload.jti,
    };
    next();
  } catch (error) {
    handleError(error, res, 'Auth middleware');
  }
}
