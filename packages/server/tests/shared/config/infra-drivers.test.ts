import { describe, expect, it } from 'vitest';
import {
  getRedisRequirementReasons,
  isRateLimitDisabledForRuntime,
  isRateLimitEnabled,
  isRateLimitRedisBacked,
} from '@config/env/infra-drivers';

describe('shared/config/env/infra-drivers', () => {
  it('should allow development to bypass rate limiting via flag', () => {
    const input = {
      NODE_ENV: 'development' as const,
      RATE_LIMIT_DRIVER: 'redis' as const,
      DISABLE_RATE_LIMIT: true,
    };

    expect(isRateLimitDisabledForRuntime(input)).toBe(true);
    expect(isRateLimitEnabled(input)).toBe(false);
    expect(isRateLimitRedisBacked(input)).toBe(false);
  });

  it('should always enforce production rate limiting when redis driver is configured', () => {
    const input = {
      NODE_ENV: 'production' as const,
      RATE_LIMIT_DRIVER: 'redis' as const,
      DISABLE_RATE_LIMIT: true,
    };

    expect(isRateLimitDisabledForRuntime(input)).toBe(false);
    expect(isRateLimitEnabled(input)).toBe(true);
    expect(isRateLimitRedisBacked(input)).toBe(true);
  });

  it('should always disable runtime rate limiting in test', () => {
    const input = {
      NODE_ENV: 'test' as const,
      RATE_LIMIT_DRIVER: 'redis' as const,
      DISABLE_RATE_LIMIT: false,
    };

    expect(isRateLimitDisabledForRuntime(input)).toBe(true);
    expect(isRateLimitEnabled(input)).toBe(false);
    expect(isRateLimitRedisBacked(input)).toBe(false);
  });

  it('should keep redis as a production requirement when disable flag is set', () => {
    expect(
      getRedisRequirementReasons({
        NODE_ENV: 'production',
        CACHE_DRIVER: 'memory',
        QUEUE_DRIVER: 'inline',
        RATE_LIMIT_DRIVER: 'redis',
        LOCK_DRIVER: 'memory',
        DISABLE_RATE_LIMIT: true,
      })
    ).toEqual(['RATE_LIMIT_DRIVER=redis']);
  });
});
