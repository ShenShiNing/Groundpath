import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { authConfig } from '@config/env';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';
import { AppError, Errors } from '../errors';

function getJwtAlgorithm(): SignOptions['algorithm'] {
  return authConfig.jwt.algorithm;
}

function assertExpectedHeader(token: string, expectedKid: string): void {
  const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt | null;
  const header = decoded?.header;

  if (!header) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid token header');
  }

  if (header.alg !== authConfig.jwt.algorithm) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid token algorithm');
  }

  if (header.kid !== expectedKid) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid token key id');
  }
}

function verifyWithPublicKey<T extends JwtPayload>(
  token: string,
  publicKey: string,
  keyId: string
): T {
  assertExpectedHeader(token, keyId);

  return jwt.verify(token, publicKey, {
    algorithms: [authConfig.jwt.algorithm],
    issuer: authConfig.jwtClaims.issuer,
    audience: authConfig.jwtClaims.audience,
  }) as T;
}

// ==================== Access Token ====================

/**
 * Generate an access token containing user information
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: authConfig.accessToken.expiresInSeconds,
    algorithm: getJwtAlgorithm(),
    issuer: authConfig.jwtClaims.issuer,
    audience: authConfig.jwtClaims.audience,
    keyid: authConfig.accessToken.keyId,
  };

  return jwt.sign(payload, authConfig.accessToken.privateKey, options);
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = verifyWithPublicKey<JwtPayload & AccessTokenPayload>(
      token,
      authConfig.accessToken.publicKey,
      authConfig.accessToken.keyId
    );

    if (typeof (decoded as JwtPayload & { type?: unknown }).type !== 'undefined') {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid access token type');
    }

    if (typeof decoded.sid !== 'string' || decoded.sid.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid access token');
    }

    return {
      sub: decoded.sub!,
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

  const options: SignOptions = {
    expiresIn: authConfig.refreshToken.expiresInSeconds,
    algorithm: getJwtAlgorithm(),
    issuer: authConfig.jwtClaims.issuer,
    audience: authConfig.jwtClaims.audience,
    keyid: authConfig.refreshToken.keyId,
  };

  return jwt.sign(payload, authConfig.refreshToken.privateKey, options);
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = verifyWithPublicKey<JwtPayload & RefreshTokenPayload>(
      token,
      authConfig.refreshToken.publicKey,
      authConfig.refreshToken.keyId
    );

    if (decoded.type !== 'refresh') {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid token type');
    }
    if (typeof decoded.sid !== 'string' || decoded.sid.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid refresh token session');
    }
    if (typeof decoded.jti !== 'string' || decoded.jti.length === 0) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid refresh token id');
    }
    if (decoded.sid !== decoded.jti) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Refresh token session mismatch');
    }

    return {
      sub: decoded.sub!,
      sid: decoded.sid,
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
  return authHeader.slice(7); // Remove "Bearer " prefix
}
