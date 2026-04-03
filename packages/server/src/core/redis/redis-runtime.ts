import { cacheConfig, coordinationConfig, featureFlags, queueConfig, rateLimitConfig } from '@config/env';
import {
  getRedisRequirementReasons,
  isCacheRedisBacked,
  isLockRedisBacked,
  isQueueRedisBacked,
  isRateLimitRedisBacked,
} from '@config/env/infra-drivers';

export function cacheRequiresRedis(): boolean {
  return isCacheRedisBacked({ CACHE_DRIVER: cacheConfig.driver });
}

export function queueRequiresRedis(): boolean {
  return isQueueRedisBacked({ QUEUE_DRIVER: queueConfig.driver });
}

export function rateLimitRequiresRedis(): boolean {
  return isRateLimitRedisBacked({
    RATE_LIMIT_DRIVER: rateLimitConfig.driver,
    DISABLE_RATE_LIMIT: featureFlags.disableRateLimit,
  });
}

export function coordinationRequiresRedis(): boolean {
  return isLockRedisBacked({ LOCK_DRIVER: coordinationConfig.driver });
}

export function getRuntimeRedisRequirementReasons(): string[] {
  return getRedisRequirementReasons({
    CACHE_DRIVER: cacheConfig.driver,
    QUEUE_DRIVER: queueConfig.driver,
    RATE_LIMIT_DRIVER: rateLimitConfig.driver,
    LOCK_DRIVER: coordinationConfig.driver,
    DISABLE_RATE_LIMIT: featureFlags.disableRateLimit,
  });
}

export function isRedisRequired(): boolean {
  return getRuntimeRedisRequirementReasons().length > 0;
}
