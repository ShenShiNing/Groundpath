import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { authConfig } from '@config/env';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types';
import { AppError, Errors } from '../errors';

// ==================== Access Token ====================

interface KeyCandidate {
  keyId?: string;
  secret: string;
}

function getTokenKid(token: string): string | undefined {
  const decoded = jwt.decode(token, { complete: true }) as
    | (jwt.Jwt & { header: { kid?: string } })
    | null;
  return decoded?.header?.kid;
}

function dedupeCandidates(candidates: KeyCandidate[]): KeyCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.keyId ?? ''}:${candidate.secret}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveVerificationCandidates(
  token: string,
  current: { keyId: string; secret: string },
  previousKeys: Array<{ keyId: string; secret: string }>,
  previousSecrets: string[]
): KeyCandidate[] {
  const tokenKid = getTokenKid(token);
  if (tokenKid) {
    if (tokenKid === current.keyId) {
      return [{ keyId: current.keyId, secret: current.secret }];
    }
    const matchedLegacyKey = previousKeys.find((key) => key.keyId === tokenKid);
    if (matchedLegacyKey) {
      return [{ keyId: matchedLegacyKey.keyId, secret: matchedLegacyKey.secret }];
    }
  }

  return dedupeCandidates([
    { keyId: current.keyId, secret: current.secret },
    ...previousKeys.map((key) => ({ keyId: key.keyId, secret: key.secret })),
    ...previousSecrets.map((secret) => ({ secret })),
  ]);
}

function verifyWithRotatingSecrets<T extends JwtPayload>(token: string, secrets: string[]): T {
  let lastJwtError: jwt.JsonWebTokenError | null = null;

  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: authConfig.jwtClaims.issuer,
        audience: authConfig.jwtClaims.audience,
      }) as T;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw error;
      }
      if (error instanceof jwt.JsonWebTokenError) {
        lastJwtError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastJwtError) {
    throw lastJwtError;
  }

  throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid token');
}

/**
 * Generate an access token containing user information
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: authConfig.accessToken.expiresInSeconds,
    algorithm: 'HS256',
    issuer: authConfig.jwtClaims.issuer,
    audience: authConfig.jwtClaims.audience,
    keyid: authConfig.accessToken.keyId,
  };

  return jwt.sign(payload, authConfig.accessToken.secret, options);
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const candidates = resolveVerificationCandidates(
      token,
      {
        keyId: authConfig.accessToken.keyId,
        secret: authConfig.accessToken.secret,
      },
      authConfig.accessToken.previousKeys,
      authConfig.accessToken.previousSecrets
    );
    const decoded = verifyWithRotatingSecrets<JwtPayload & AccessTokenPayload>(
      token,
      candidates.map((candidate) => candidate.secret)
    );

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
    expiresIn: authConfig.refreshToken.expiresInSeconds,
    algorithm: 'HS256',
    issuer: authConfig.jwtClaims.issuer,
    audience: authConfig.jwtClaims.audience,
    keyid: authConfig.refreshToken.keyId,
  };

  return jwt.sign(payload, authConfig.refreshToken.secret, options);
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const candidates = resolveVerificationCandidates(
      token,
      {
        keyId: authConfig.refreshToken.keyId,
        secret: authConfig.refreshToken.secret,
      },
      authConfig.refreshToken.previousKeys,
      authConfig.refreshToken.previousSecrets
    );
    const decoded = verifyWithRotatingSecrets<JwtPayload & RefreshTokenPayload>(
      token,
      candidates.map((candidate) => candidate.secret)
    );

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
