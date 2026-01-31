import type { Request } from 'express';
import { AppError } from '@shared/errors/app-error';

/**
 * Extract client IP address from request.
 * Handles X-Forwarded-For header for proxied requests.
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]?.trim();
    if (ip) return ip;
  }
  return req.socket.remoteAddress ?? null;
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
