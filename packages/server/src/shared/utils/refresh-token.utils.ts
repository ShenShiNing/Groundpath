import crypto from 'crypto';
import { authConfig } from '@config/env';

/**
 * Hash refresh token for storage/lookup.
 */
export function hashRefreshToken(token: string): string {
  return crypto
    .createHmac('sha256', authConfig.tokenHashing.refreshTokenSecret)
    .update(token)
    .digest('hex');
}

/**
 * Constant-time compare for hashed refresh token values.
 */
export function safeCompareTokenHash(storedHash: string, candidateHash: string): boolean {
  const stored = Buffer.from(storedHash);
  const candidate = Buffer.from(candidateHash);

  if (stored.length !== candidate.length) {
    return false;
  }

  return crypto.timingSafeEqual(stored, candidate);
}

/**
 * Verify incoming refresh token against stored value.
 * Stored value must be a HMAC-SHA256 hash.
 */
export function isStoredRefreshTokenMatch(storedValue: string, refreshToken: string): boolean {
  const hash = hashRefreshToken(refreshToken);
  return safeCompareTokenHash(storedValue, hash);
}
