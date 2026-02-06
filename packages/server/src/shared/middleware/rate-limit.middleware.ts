import type { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { ApiResponse } from '@knowledge-agent/shared';
import { serverConfig, featureFlags } from '@config/env';
import { getClientIp } from '../utils/request.utils';

// ============================================================================
// Types
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
}

interface AccountRateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remainingAttempts?: number;
}

// ============================================================================
// In-Memory Rate Limiter
// ============================================================================

const cleanupIntervals = new Set<ReturnType<typeof setInterval>>();

/**
 * Create an in-memory rate limiter middleware
 * Note: For production with multiple server instances, use Redis-based rate limiter
 */
export function createRateLimiter(options: RateLimitOptions) {
  // Skip rate limiting in test environment
  if (serverConfig.nodeEnv === 'test' || featureFlags.disableRateLimit) {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  const store = new Map<string, RateLimitEntry>();
  const keyGenerator = options.keyGenerator ?? ((req: Request) => getClientIp(req) ?? 'unknown');
  const message = options.message ?? 'Too many requests, please try again later';

  // Cleanup expired entries periodically (at least every minute)
  const cleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (entry.resetAt < now) {
          store.delete(key);
        }
      }
    },
    Math.min(options.windowMs, 60 * 1000)
  );
  cleanupIntervals.add(cleanupInterval);

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key = keyGenerator(req);
    const now = Date.now();
    const entry = store.get(key);

    // New window or expired entry
    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      setRateLimitHeaders(
        res,
        options.maxRequests,
        options.maxRequests - 1,
        now + options.windowMs
      );
      next();
      return;
    }

    // Check if limit exceeded
    if (entry.count >= options.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      setRateLimitHeaders(res, options.maxRequests, 0, entry.resetAt);

      const response: ApiResponse = {
        success: false,
        error: {
          code: AUTH_ERROR_CODES.RATE_LIMITED,
          message,
          details: { retryAfter },
        },
      };
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(response);
      return;
    }

    // Increment count and continue
    entry.count++;
    setRateLimitHeaders(res, options.maxRequests, options.maxRequests - entry.count, entry.resetAt);
    next();
  };
}

/**
 * Set standard rate limit headers
 */
function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetAt: number
): void {
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());
}

/**
 * Cleanup all rate limiter intervals (for graceful shutdown)
 */
export function cleanupRateLimiters(): void {
  for (const interval of cleanupIntervals) {
    clearInterval(interval);
  }
  cleanupIntervals.clear();
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/**
 * Login rate limiter - strict to prevent brute force
 * 5 requests per minute per IP
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: 'Too many login attempts, please try again later',
});

/**
 * Register rate limiter - strict to prevent batch registration
 * 3 requests per minute per IP
 */
export const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 3,
  message: 'Too many registration attempts, please try again later',
});

/**
 * Refresh token rate limiter
 * 10 requests per 5 minutes per IP
 */
export const refreshRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10,
  message: 'Too many refresh attempts, please try again later',
});

/**
 * General API rate limiter
 * 100 requests per minute per IP
 */
export const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: 'Too many requests, please try again later',
});

/**
 * Email send rate limiter - strict to prevent spam
 * 2 requests per minute per IP
 */
export const emailSendRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 2,
  message: 'Too many email requests, please try again later',
});

/**
 * Email verify rate limiter - to prevent brute force code guessing
 * 10 requests per 5 minutes per IP
 */
export const emailVerifyRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10,
  message: 'Too many verification attempts, please try again later',
});

/**
 * Password reset rate limiter
 * 3 requests per minute per IP
 */
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 3,
  message: 'Too many password reset attempts, please try again later',
});

// ============================================================================
// Account-Level Rate Limiter (for login attempts by email)
// ============================================================================

const accountLimitStore = new Map<string, RateLimitEntry>();

// Cleanup account limit store periodically
if (serverConfig.nodeEnv !== 'test') {
  const accountCleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of accountLimitStore) {
        if (entry.resetAt < now) {
          accountLimitStore.delete(key);
        }
      }
    },
    5 * 60 * 1000 // Every 5 minutes
  );
  cleanupIntervals.add(accountCleanupInterval);
}

/**
 * Check if login attempt is allowed for this account
 * Prevents distributed brute force attacks
 * 10 failed attempts per hour per account
 */
export function checkAccountRateLimit(email: string): AccountRateLimitResult {
  if (serverConfig.nodeEnv === 'test' || featureFlags.disableRateLimit) {
    return { allowed: true };
  }

  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxAttempts = 10;

  const key = email.toLowerCase().trim();
  const entry = accountLimitStore.get(key);

  // New window or expired entry
  if (!entry || entry.resetAt < now) {
    accountLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remainingAttempts: maxAttempts - 1 };
  }

  // Check if limit exceeded
  if (entry.count >= maxAttempts) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter, remainingAttempts: 0 };
  }

  // Increment and allow
  entry.count++;
  return { allowed: true, remainingAttempts: maxAttempts - entry.count };
}

/**
 * Reset account rate limit on successful login
 */
export function resetAccountRateLimit(email: string): void {
  accountLimitStore.delete(email.toLowerCase().trim());
}

/**
 * Increment account rate limit on failed login
 * Call this after a failed login attempt
 */
export function incrementAccountRateLimit(email: string): void {
  if (serverConfig.nodeEnv === 'test' || featureFlags.disableRateLimit) {
    return;
  }

  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour

  const key = email.toLowerCase().trim();
  const entry = accountLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    accountLimitStore.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count++;
  }
}
