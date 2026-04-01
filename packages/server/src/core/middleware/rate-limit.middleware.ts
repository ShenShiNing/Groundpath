import type { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, AUTH_ERROR_CODES } from '@groundpath/shared';
import { documentConfig, featureFlags, serverConfig } from '@config/env';
import { Errors } from '@core/errors';
import { sendErrorResponse } from '@core/errors/response';
import { createLogger } from '@core/logger';
import { buildRedisKey, getRedisClient } from '@core/redis';
import { getClientIp } from '../utils/request.utils';

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

const logger = createLogger('rate-limit.middleware');

const INCREMENT_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  ttl = tonumber(ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ttl)
end
return {current, ttl}
`;

async function incrementCounter(
  key: string,
  windowMs: number
): Promise<{ count: number; ttlMs: number }> {
  const redis = getRedisClient();
  const fullKey = buildRedisKey(key);
  const result = await redis.eval(INCREMENT_WINDOW_SCRIPT, 1, fullKey, windowMs.toString());

  if (!Array.isArray(result) || result.length < 2) {
    throw Errors.internal('Invalid Redis rate limiter response');
  }

  const count = Number(result[0]);
  const ttlMs = Math.max(Number(result[1]), 0);
  return { count, ttlMs };
}

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

function isRateLimitDisabled(): boolean {
  return serverConfig.nodeEnv === 'test' || featureFlags.disableRateLimit;
}

function getScopedRateLimitKey(scope: string, req: Request): string {
  const userId = req.user?.sub;
  if (userId) {
    return `${scope}:user:${userId}`;
  }
  return `${scope}:ip:${getClientIp(req) ?? 'unknown'}`;
}

export function createRateLimiter(options: RateLimitOptions) {
  if (isRateLimitDisabled()) {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  const keyGenerator = options.keyGenerator ?? ((req: Request) => getClientIp(req) ?? 'unknown');
  const message = options.message ?? 'Too many requests, please try again later';

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const key = keyGenerator(req);
      const redisKey = `ratelimit:ip:${key}`;
      const { count, ttlMs } = await incrementCounter(redisKey, options.windowMs);
      const resetAt = Date.now() + ttlMs;

      if (count > options.maxRequests) {
        const retryAfter = Math.ceil(ttlMs / 1000);
        res.setHeader('Retry-After', retryAfter.toString());
        setRateLimitHeaders(res, options.maxRequests, 0, resetAt);

        sendErrorResponse(
          res,
          HTTP_STATUS.TOO_MANY_REQUESTS,
          AUTH_ERROR_CODES.RATE_LIMITED,
          message,
          {
            details: { retryAfter },
          }
        );
        return;
      }

      setRateLimitHeaders(res, options.maxRequests, options.maxRequests - count, resetAt);
      next();
    } catch (error) {
      logger.error({ err: error }, 'Rate limiter redis operation failed');
      next(Errors.internal('Rate limiter unavailable'));
    }
  };
}

export function cleanupRateLimiters(): void {
  // Redis-backed limiter does not require interval cleanup.
}

export const loginRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'Too many login attempts, please try again later',
});

export const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 3,
  message: 'Too many registration attempts, please try again later',
});

export const refreshRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many refresh attempts, please try again later',
});

export const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  message: 'Too many requests, please try again later',
});

export const trashMutationRateLimiter = createRateLimiter({
  windowMs: documentConfig.trashRateLimit.mutationWindowMs,
  maxRequests: documentConfig.trashRateLimit.mutationMaxRequests,
  keyGenerator: (req) => getScopedRateLimitKey('trash-mutation', req),
  message: 'Too many trash operations, please try again later',
});

export const trashClearRateLimiter = createRateLimiter({
  windowMs: documentConfig.trashRateLimit.clearWindowMs,
  maxRequests: documentConfig.trashRateLimit.clearMaxRequests,
  keyGenerator: (req) => getScopedRateLimitKey('trash-clear', req),
  message: 'Too many trash clear attempts, please try again later',
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  message: 'Too many AI requests, please try again later',
});

export const emailSendRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 2,
  message: 'Too many email requests, please try again later',
});

export const emailVerifyRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many verification attempts, please try again later',
});

export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 3,
  message: 'Too many password reset attempts, please try again later',
});

const ACCOUNT_WINDOW_MS = 60 * 60 * 1000;
const ACCOUNT_MAX_ATTEMPTS = 10;

export async function checkAccountRateLimit(email: string): Promise<AccountRateLimitResult> {
  if (isRateLimitDisabled()) {
    return { allowed: true };
  }

  try {
    const key = `ratelimit:account:${email.toLowerCase().trim()}`;
    const { count, ttlMs } = await incrementCounter(key, ACCOUNT_WINDOW_MS);

    if (count > ACCOUNT_MAX_ATTEMPTS) {
      return {
        allowed: false,
        retryAfter: Math.ceil(ttlMs / 1000),
        remainingAttempts: 0,
      };
    }

    return {
      allowed: true,
      remainingAttempts: Math.max(0, ACCOUNT_MAX_ATTEMPTS - count),
    };
  } catch (error) {
    logger.error({ err: error, email }, 'Account rate limiter redis operation failed');
    throw Errors.internal('Authentication rate limiter unavailable');
  }
}

export async function resetAccountRateLimit(email: string): Promise<void> {
  if (isRateLimitDisabled()) {
    return;
  }

  const key = buildRedisKey(`ratelimit:account:${email.toLowerCase().trim()}`);
  await getRedisClient().del(key);
}

export async function incrementAccountRateLimit(email: string): Promise<void> {
  if (isRateLimitDisabled()) {
    return;
  }

  const key = `ratelimit:account:${email.toLowerCase().trim()}`;
  await incrementCounter(key, ACCOUNT_WINDOW_MS);
}
