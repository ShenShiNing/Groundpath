import helmet from 'helmet';
import cors from 'cors';
import type { Request, Response, NextFunction } from 'express';
import { env } from '@config/env';

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
      imgSrc: ["'self'", 'data:', 'blob:', env.R2_PUBLIC_URL].filter(Boolean),
      connectSrc: ["'self'", env.FRONTEND_URL],
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
  const frontendUrl = env.FRONTEND_URL;

  // In development, allow localhost variations
  if (env.NODE_ENV === 'development') {
    return [frontendUrl, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
  }

  // In production, only allow specific origins
  return [frontendUrl];
}

/**
 * CORS configuration
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = parseAllowedOrigins();

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Check if origin is allowed
    const isAllowed = allowedOrigins.some((allowed) => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      }
      return allowed.test(origin);
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
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
