import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { authConfig } from '@config/env';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';
import { AppError, Errors } from '../errors';

type JwtKeyStatus = 'active' | 'previous' | 'disabled';
type JwtPurpose = 'access' | 'refresh' | 'emailVerification' | 'oauthState';

interface JwtKey {
  kid: string;
  publicKey: string;
  privateKey?: string;
  status: JwtKeyStatus;
}

interface JwtKeyRing {
  activeKid: string;
  keys: JwtKey[];
}

export interface OAuthStateTokenPayload {
  returnUrl: string;
  purpose: 'oauth_state';
}

export interface EmailVerificationTokenPayload {
  sub: string;
  type: string;
  purpose: 'email_verified';
}

function getJwtAlgorithm(): SignOptions['algorithm'] {
  return authConfig.jwt.algorithm;
}

function getKeyRing(purpose: JwtPurpose): JwtKeyRing {
  switch (purpose) {
    case 'access':
      return authConfig.keyRings.access;
    case 'refresh':
      return authConfig.keyRings.refresh;
    case 'emailVerification':
      return authConfig.keyRings.emailVerification;
    case 'oauthState':
      return authConfig.keyRings.oauthState;
  }
}

function getActiveSigningKey(purpose: JwtPurpose): JwtKey & { privateKey: string } {
  const ring = getKeyRing(purpose);
  const key = ring.keys.find((candidate) => candidate.kid === ring.activeKid);

  if (!key?.privateKey) {
    throw new Error(`JWT signing key for purpose "${purpose}" is not configured`);
  }

  return {
    ...key,
    privateKey: key.privateKey,
  };
}

function resolveVerificationKey(token: string, purpose: JwtPurpose): JwtKey {
  const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt | null;
  const header = decoded?.header;

  if (!header) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid token header');
  }

  if (header.alg !== authConfig.jwt.algorithm) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid token algorithm');
  }

  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Missing token key id');
  }

  const ring = getKeyRing(purpose);
  const verificationKey = ring.keys.find(
    (candidate) =>
      candidate.kid === header.kid &&
      (candidate.status === 'active' || candidate.status === 'previous')
  );
  if (!verificationKey) {
    throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Unknown token key id');
  }

  return verificationKey;
}

function verifyWithPurpose<T extends JwtPayload>(token: string, purpose: JwtPurpose): T {
  const verificationKey = resolveVerificationKey(token, purpose);

  return jwt.verify(token, verificationKey.publicKey, {
    algorithms: [authConfig.jwt.algorithm],
    issuer: authConfig.jwtClaims.issuer,
    audience: authConfig.jwtClaims.audience,
  }) as T;
}

function signWithPurpose(
  payload: string | object | Buffer,
  purpose: JwtPurpose,
  expiresIn: SignOptions['expiresIn']
): string {
  const signingKey = getActiveSigningKey(purpose);
  const options: SignOptions = {
    expiresIn,
    algorithm: getJwtAlgorithm(),
    issuer: authConfig.jwtClaims.issuer,
    audience: authConfig.jwtClaims.audience,
    keyid: signingKey.kid,
  };

  return jwt.sign(payload, signingKey.privateKey, options);
}

// ==================== Access Token ====================

/**
 * Generate an access token containing user information
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  return signWithPurpose(payload, 'access', authConfig.accessToken.expiresInSeconds);
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = verifyWithPurpose<JwtPayload & AccessTokenPayload>(token, 'access');

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

  return signWithPurpose(payload, 'refresh', authConfig.refreshToken.expiresInSeconds);
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = verifyWithPurpose<JwtPayload & RefreshTokenPayload>(token, 'refresh');

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

// ==================== OAuth State Token ====================

export function generateOAuthStateToken(returnUrl: string, expiresIn: SignOptions['expiresIn']): string {
  const payload: OAuthStateTokenPayload = {
    returnUrl,
    purpose: 'oauth_state',
  };
  return signWithPurpose(payload, 'oauthState', expiresIn);
}

export function verifyOAuthStateToken(token: string): OAuthStateTokenPayload {
  try {
    const decoded = verifyWithPurpose<JwtPayload & OAuthStateTokenPayload>(token, 'oauthState');

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
  return signWithPurpose(payload, 'emailVerification', expiresIn);
}

export function verifyEmailVerificationToken(token: string): EmailVerificationTokenPayload {
  try {
    const decoded = verifyWithPurpose<JwtPayload & EmailVerificationTokenPayload>(
      token,
      'emailVerification'
    );

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
