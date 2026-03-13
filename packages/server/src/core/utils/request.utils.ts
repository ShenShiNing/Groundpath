import type { Request } from 'express';
import { AppError } from '@core/errors/app-error';

/**
 * Normalize email address for consistent storage and lookup.
 * Applies lowercase and trim to ensure case-insensitive matching.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
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
  // req.ip is undefined if trust proxy is not set and there's no direct IP
  // It properly handles X-Forwarded-For only when trust proxy is configured
  return req.ip ?? req.socket.remoteAddress ?? null;
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
