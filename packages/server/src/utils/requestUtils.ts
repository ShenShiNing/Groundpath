import type { Request } from 'express';

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
