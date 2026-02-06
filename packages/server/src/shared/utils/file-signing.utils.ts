import crypto from 'crypto';
import { storageConfig } from '@config/env';

function getSigningSecret(): string {
  return storageConfig.signing.secret;
}

export interface SignedUrlOptions {
  key: string;
  expiresIn?: number; // seconds
}

/**
 * Generate a signed URL for file access
 * Format: /api/files/{encodedKey}?sig={signature}&exp={timestamp}
 */
export function generateSignedUrl(options: SignedUrlOptions): string {
  const { key, expiresIn = storageConfig.signing.fileUrlExpiresIn } = options;
  const exp = Math.floor(Date.now() / 1000) + expiresIn;

  const payload = `${key}:${exp}`;
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');

  const encodedKey = encodeURIComponent(key);
  return `/api/files/${encodedKey}?sig=${sig}&exp=${exp}`;
}

/**
 * Verify a signed URL's signature and expiration
 * @returns true if valid, false if invalid or expired
 */
export function verifySignature(key: string, sig: string, exp: number): boolean {
  // Check expiration first
  if (Date.now() / 1000 > exp) {
    return false;
  }

  const payload = `${key}:${exp}`;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('base64url');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    // Buffer length mismatch
    return false;
  }
}
