import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import { AUTH_ERROR_CODES } from '@groundpath/shared';
import { authConfig } from '@config/env';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';
import { AppError, Errors } from '../errors';

export interface OAuthStateTokenPayload {
  returnUrl: string;
  purpose: 'oauth_state';
}

export interface EmailVerificationTokenPayload {
  sub: string;
  type: string;
  purpose: 'email_verified';
}

function sign(payload: string | object | Buffer, expiresIn: SignOptions['expiresIn']): string {
  return jwt.sign(payload, authConfig.jwt.secret, {
    algorithm: 'HS256',
    issuer: authConfig.jwt.issuer,
    audience: authConfig.jwt.audience,
    expiresIn,
  });
}

function verify<T extends JwtPayload>(token: string): T {
  return jwt.verify(token, authConfig.jwt.secret, {
    algorithms: ['HS256'],
    issuer: authConfig.jwt.issuer,
    audience: authConfig.jwt.audience,
  }) as T;
}

// ==================== Access Token ====================

/**
 * Generate an access token containing user information
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  return sign(payload, authConfig.accessToken.expiresInSeconds);
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = verify<JwtPayload & AccessTokenPayload>(token);

    if (typeof (decoded as JwtPayload & { type?: unknown }).type !== 'undefined') {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid access token type');
    }

    if (typeof decoded.sid !== 'string' || decoded.sid.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid access token');
    }
    if (typeof decoded.sub !== 'string' || decoded.sub.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid access token subject');
    }

    return {
      sub: decoded.sub,
      email: decoded.email,
      username: decoded.username,
      status: decoded.status,
      emailVerified: decoded.emailVerified,
      sid: decoded.sid,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
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
export function generateRefreshToken(userId: string, sessionId: string): string {
  const payload: RefreshTokenPayload = {
    sub: userId,
    sid: sessionId,
    jti: sessionId,
    type: 'refresh',
  };

  return sign(payload, authConfig.refreshToken.expiresInSeconds);
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = verify<JwtPayload & RefreshTokenPayload>(token);

    if (decoded.type !== 'refresh') {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid token type');
    }
    if (typeof decoded.sid !== 'string' || decoded.sid.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid refresh token session');
    }
    if (typeof decoded.jti !== 'string' || decoded.jti.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid refresh token id');
    }
    if (typeof decoded.sub !== 'string' || decoded.sub.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid refresh token subject');
    }
    if (decoded.sid !== decoded.jti) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Refresh token session mismatch');
    }

    return {
      sub: decoded.sub,
      sid: decoded.sid,
      jti: decoded.jti,
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

// ==================== OAuth State Token ====================

export function generateOAuthStateToken(
  returnUrl: string,
  expiresIn: SignOptions['expiresIn']
): string {
  const payload: OAuthStateTokenPayload = {
    returnUrl,
    purpose: 'oauth_state',
  };
  return sign(payload, expiresIn);
}

export function verifyOAuthStateToken(token: string): OAuthStateTokenPayload {
  try {
    const decoded = verify<JwtPayload & OAuthStateTokenPayload>(token);

    if (decoded.purpose !== 'oauth_state' || typeof decoded.returnUrl !== 'string') {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid OAuth state token');
    }

    return {
      returnUrl: decoded.returnUrl,
      purpose: decoded.purpose,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_EXPIRED, 'OAuth state token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid OAuth state token');
    }
    throw error;
  }
}

// ==================== Email Verification Token ====================

export function generateEmailVerificationToken(
  payload: EmailVerificationTokenPayload,
  expiresIn: SignOptions['expiresIn']
): string {
  return sign(payload, expiresIn);
}

export function verifyEmailVerificationToken(token: string): EmailVerificationTokenPayload {
  try {
    const decoded = verify<JwtPayload & EmailVerificationTokenPayload>(token);

    if (decoded.purpose !== 'email_verified') {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid email verification token');
    }
    if (typeof decoded.sub !== 'string' || decoded.sub.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid email verification subject');
    }
    if (typeof decoded.type !== 'string' || decoded.type.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid email verification type');
    }

    return {
      sub: decoded.sub,
      type: decoded.type,
      purpose: decoded.purpose,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_EXPIRED, 'Email verification token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid email verification token');
    }
    throw error;
  }
}

// ==================== Utility Functions ====================

/**
 * Read token issue time (iat, seconds since epoch) from token payload.
 * Returns null when token cannot be decoded or iat is missing.
 */
export function getTokenIssuedAt(token: string): number | null {
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (!decoded || typeof decoded.iat !== 'number') {
    return null;
  }
  return decoded.iat;
}

/**
 * Extract token from Authorization header
 * Supports: "Bearer <token>" format
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}
