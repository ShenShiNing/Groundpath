import { buildRedisKey, getRedisClient } from '@core/redis';
import { Errors } from '@core/errors';
import type { RateLimitStore, RateLimitWindowState } from '../../types';

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

class RedisRateLimitStore implements RateLimitStore {
  async incrementWindow(key: string, windowMs: number): Promise<RateLimitWindowState> {
    const result = await getRedisClient().eval(
      INCREMENT_WINDOW_SCRIPT,
      1,
      buildRedisKey(key),
      windowMs.toString()
    );

    if (!Array.isArray(result) || result.length < 2) {
      throw Errors.internal('Invalid Redis rate limiter response');
    }

    return {
      count: Number(result[0]),
      ttlMs: Math.max(Number(result[1]), 0),
    };
  }

  async reset(key: string): Promise<void> {
    await getRedisClient().del(buildRedisKey(key));
  }

  async ping(): Promise<void> {
    await getRedisClient().ping();
  }
}

export function createRedisRateLimitStore(): RateLimitStore {
  return new RedisRateLimitStore();
}
