import helmet from 'helmet';
import cors from 'cors';
import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { serverConfig, storageConfig } from '@config/env';
import { Errors, handleError } from '@core/errors';
import type { AccessTokenPayload, RefreshTokenContext } from '@core/types';
import { getCsrfTokenFromRequest } from '@core/utils/cookie.utils';

// ============================================================================
// Helmet - Security Headers
// ============================================================================

/**
 * Helmet middleware for setting various HTTP headers for security
 * https://helmetjs.github.io/
 */
export const helmetMiddleware = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for some UI libs
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', storageConfig.r2.publicUrl].filter(Boolean),
      connectSrc: ["'self'", serverConfig.frontendUrl],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // Strict-Transport-Security (HTTPS only)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // Prevent MIME type sniffing
  noSniff: true,
  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// ============================================================================
// CORS - Cross-Origin Resource Sharing
// ============================================================================

/**
 * Parse allowed origins from environment
 * Supports comma-separated list of origins
 */
function parseAllowedOrigins(): (string | RegExp)[] {
  const frontendUrl = serverConfig.frontendUrl;

  // In development, allow localhost variations
  if (serverConfig.nodeEnv === 'development') {
    return [frontendUrl, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
  }

  // In production, only allow specific origins
  return [frontendUrl];
}

function isAllowedOrigin(origin: string): boolean {
  const allowedOrigins = parseAllowedOrigins();

  return allowedOrigins.some((allowed) => {
    if (typeof allowed === 'string') {
      return origin === allowed;
    }
    return allowed.test(origin);
  });
}

function extractRequestOrigin(req: Request): string | null {
  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader.length > 0) {
    return originHeader;
  }

  const refererHeader = req.headers.referer;
  if (typeof refererHeader !== 'string' || refererHeader.length === 0) {
    return null;
  }

  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
}

function isProtectedCsrfMethod(method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return (
    normalizedMethod === 'POST' ||
    normalizedMethod === 'PUT' ||
    normalizedMethod === 'PATCH' ||
    normalizedMethod === 'DELETE'
  );
}

function extractCsrfTokenHeader(req: Request): string | null {
  const raw = req.headers['x-csrf-token'];
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }

  if (Array.isArray(raw) && raw[0]) {
    return raw[0];
  }

  return null;
}

function isSameToken(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * CSRF protection middleware.
 * Enforces:
 * 1) Origin/Referer origin must be trusted.
 * 2) Double-submit token check: X-CSRF-Token header == csrf cookie.
 */
export function requireCsrfProtection(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!isProtectedCsrfMethod(req.method)) {
      next();
      return;
    }

    const requestOrigin = extractRequestOrigin(req);
    if (!requestOrigin || !isAllowedOrigin(requestOrigin)) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid request origin', 403, {
        origin: requestOrigin,
      });
    }

    const csrfHeaderToken = extractCsrfTokenHeader(req);
    const csrfCookieToken = getCsrfTokenFromRequest(req);
    if (!csrfHeaderToken || !csrfCookieToken) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'CSRF token required', 403);
    }

    if (!isSameToken(csrfCookieToken, csrfHeaderToken)) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'CSRF token mismatch', 403);
    }

    next();
  } catch (error) {
    handleError(error, res, 'CSRF middleware');
  }
}

/**
 * CORS configuration
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token',
    'X-Language',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-Id',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours preflight cache
});

// ============================================================================
// Request ID - Request Tracing
// ============================================================================

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      user?: AccessTokenPayload;
      refreshContext?: RefreshTokenContext;
    }
  }
}

/**
 * Generate a simple unique request ID
 */
function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Request ID middleware for tracing
 * Adds a unique ID to each request for debugging and logging
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate a new one
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}
