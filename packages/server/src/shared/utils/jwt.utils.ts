import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { AUTH_CONFIG } from '@config/auth.config';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';
import { AppError, Errors } from '../errors';

// ==================== Access Token ====================

/**
 * Generate an access token containing user information
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: AUTH_CONFIG.accessToken.expiresIn,
    algorithm: 'HS256',
  };

  return jwt.sign(payload, AUTH_CONFIG.accessToken.secret, options);
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, AUTH_CONFIG.accessToken.secret, {
      algorithms: ['HS256'],
    }) as JwtPayload & AccessTokenPayload;

    return {
      sub: decoded.sub!,
      email: decoded.email,
      username: decoded.username,
      status: decoded.status,
      emailVerified: decoded.emailVerified,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_EXPIRED, 'Access token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid access token');
    }
    throw error;
  }
}

// ==================== Refresh Token ====================

/**
 * Generate a refresh token with minimal payload
 */
export function generateRefreshToken(userId: string, tokenId: string): string {
  const payload: RefreshTokenPayload = {
    sub: userId,
    jti: tokenId,
    type: 'refresh',
  };

  const options: SignOptions = {
    expiresIn: AUTH_CONFIG.refreshToken.expiresIn,
    algorithm: 'HS256',
  };

  return jwt.sign(payload, AUTH_CONFIG.refreshToken.secret, options);
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, AUTH_CONFIG.refreshToken.secret, {
      algorithms: ['HS256'],
    }) as JwtPayload & RefreshTokenPayload;

    if (decoded.type !== 'refresh') {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid token type');
    }

    return {
      sub: decoded.sub!,
      jti: decoded.jti!,
      type: decoded.type,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_EXPIRED, 'Refresh token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid refresh token');
    }
    throw error;
  }
}

// ==================== Utility Functions ====================

/**
 * Extract token from Authorization header
 * Supports: "Bearer <token>" format
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7); // Remove "Bearer " prefix
}
