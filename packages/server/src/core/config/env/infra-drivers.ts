export type NodeEnvName = 'development' | 'production' | 'test';
export type CacheDriverName = 'redis' | 'memory';
export type RateLimitDriverName = 'redis' | 'memory' | 'noop';
export type LockDriverName = 'redis' | 'memory';
export type QueueDriverName = 'bullmq' | 'inline';

export interface InfraDriverSelection {
  NODE_ENV: NodeEnvName;
  CACHE_DRIVER: CacheDriverName;
  QUEUE_DRIVER: QueueDriverName;
  RATE_LIMIT_DRIVER: RateLimitDriverName;
  LOCK_DRIVER: LockDriverName;
  DISABLE_RATE_LIMIT: boolean;
}

export function isCacheRedisBacked(input: Pick<InfraDriverSelection, 'CACHE_DRIVER'>): boolean {
  return input.CACHE_DRIVER === 'redis';
}

export function isQueueRedisBacked(input: Pick<InfraDriverSelection, 'QUEUE_DRIVER'>): boolean {
  return input.QUEUE_DRIVER === 'bullmq';
}

export function isRateLimitDisabledForRuntime(
  input: Pick<InfraDriverSelection, 'NODE_ENV' | 'RATE_LIMIT_DRIVER' | 'DISABLE_RATE_LIMIT'>
): boolean {
  if (input.NODE_ENV === 'test') {
    return true;
  }

  if (input.NODE_ENV === 'production') {
    return false;
  }

  return input.DISABLE_RATE_LIMIT || input.RATE_LIMIT_DRIVER === 'noop';
}

export function isRateLimitEnabled(
  input: Pick<InfraDriverSelection, 'NODE_ENV' | 'RATE_LIMIT_DRIVER' | 'DISABLE_RATE_LIMIT'>
): boolean {
  return !isRateLimitDisabledForRuntime(input);
}

export function isRateLimitRedisBacked(
  input: Pick<InfraDriverSelection, 'NODE_ENV' | 'RATE_LIMIT_DRIVER' | 'DISABLE_RATE_LIMIT'>
): boolean {
  return isRateLimitEnabled(input) && input.RATE_LIMIT_DRIVER === 'redis';
}

export function isLockRedisBacked(input: Pick<InfraDriverSelection, 'LOCK_DRIVER'>): boolean {
  return input.LOCK_DRIVER === 'redis';
}

export function getRedisRequirementReasons(input: InfraDriverSelection): string[] {
  const reasons: string[] = [];

  if (isCacheRedisBacked(input)) {
    reasons.push('CACHE_DRIVER=redis');
  }

  if (isQueueRedisBacked(input)) {
    reasons.push('QUEUE_DRIVER=bullmq');
  }

  if (isRateLimitRedisBacked(input)) {
    reasons.push(`RATE_LIMIT_DRIVER=${input.RATE_LIMIT_DRIVER}`);
  }

  if (isLockRedisBacked(input)) {
    reasons.push('LOCK_DRIVER=redis');
  }

  return reasons;
}

export function isRedisRequiredByInfra(input: InfraDriverSelection): boolean {
  return getRedisRequirementReasons(input).length > 0;
}
