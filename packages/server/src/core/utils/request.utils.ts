import type { Request } from 'express';
import { AppError } from '@core/errors/app-error';

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^::1$/i,
  /^fe80:/i,
  /^fc00:/i,
  /^fd/i,
] as const;

/**
 * Normalize email address for consistent storage and lookup.
 * Applies lowercase and trim to ensure case-insensitive matching.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function normalizeIpAddress(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) {
    return null;
  }

  let normalized = ipAddress.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes(',')) {
    normalized = normalized.split(',')[0]?.trim() ?? '';
  }

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('[')) {
    const closingIndex = normalized.indexOf(']');
    if (closingIndex > 0) {
      normalized = normalized.slice(1, closingIndex);
    }
  } else {
    const ipv4WithPortMatch = normalized.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPortMatch) {
      normalized = ipv4WithPortMatch[1];
    }
  }

  const zoneIndex = normalized.indexOf('%');
  if (zoneIndex !== -1) {
    normalized = normalized.slice(0, zoneIndex);
  }

  if (normalized.toLowerCase().startsWith('::ffff:')) {
    normalized = normalized.slice('::ffff:'.length);
  }

  return normalized || null;
}

export function isPrivateIpAddress(ipAddress: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ipAddress));
}

/**
 * Extract client IP address from request.
 *
 * Uses Express's built-in `req.ip` which respects the `trust proxy` setting.
 * When trust proxy is configured, Express will correctly parse X-Forwarded-For.
 * When not configured, it falls back to the direct connection IP.
 *
 * IMPORTANT: Set TRUST_PROXY env var when behind a reverse proxy (nginx, cloudflare, etc.)
 * to ensure correct IP detection. Without it, X-Forwarded-For is ignored for security.
 *
 * @see https://expressjs.com/en/guide/behind-proxies.html
 */
export function getClientIp(req: Request): string | null {
  const directIp = normalizeIpAddress(req.ip ?? req.socket.remoteAddress ?? null);
  if (directIp && !isPrivateIpAddress(directIp)) {
    return directIp;
  }

  // Fallback for proxied production deployments where the app only sees a private hop IP.
  const forwardedForHeader = req.headers['x-forwarded-for'];
  const forwardedIp = normalizeIpAddress(
    Array.isArray(forwardedForHeader) ? forwardedForHeader[0] : forwardedForHeader
  );
  if (forwardedIp) {
    return forwardedIp;
  }

  const realIpHeader = req.headers['x-real-ip'];
  const realIp = normalizeIpAddress(Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader);
  if (realIp) {
    return realIp;
  }

  return directIp;
}

/**
 * Extract authenticated user ID from request.
 * Throws AppError if not authenticated.
 */
export function requireUserId(req: Request): string {
  const userId = req.user?.sub;
  if (!userId) {
    throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
  }
  return userId;
}

/**
 * Get string param from request params (handles Express 5 string | string[] type).
 */
export function getParamId(req: Request, paramName: string): string | undefined {
  const value = req.params[paramName];
  return Array.isArray(value) ? value[0] : value;
}
