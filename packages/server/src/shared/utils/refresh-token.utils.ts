import crypto from 'crypto';
import { authConfig } from '@config/env';

/**
 * Hash refresh token for storage/lookup.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHmac('sha256', authConfig.encryptionKey).update(token).digest('hex');
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
 * Supports legacy plaintext tokens for backward compatibility during migration.
 */
export function isStoredRefreshTokenMatch(storedValue: string, refreshToken: string): boolean {
  if (storedValue === refreshToken) {
    return true;
  }

  const hash = hashRefreshToken(refreshToken);
  return safeCompareTokenHash(storedValue, hash);
}
