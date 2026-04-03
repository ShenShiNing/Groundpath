import { cacheConfig } from '@config/env';
import { createMemoryCacheDriver } from './drivers/memory/memory-cache.driver';
import { createRedisCacheDriver } from './drivers/redis/redis-cache.driver';
import type { CacheDriver } from './types';

let cacheDriver: CacheDriver | null = null;

function createConfiguredCacheDriver(): CacheDriver {
  switch (cacheConfig.driver) {
    case 'memory':
      return createMemoryCacheDriver();
    case 'redis':
    default:
      return createRedisCacheDriver();
  }
}

export function getCacheDriver(): CacheDriver {
  if (!cacheDriver) {
    cacheDriver = createConfiguredCacheDriver();
  }

  return cacheDriver;
}

export async function closeCacheDriver(): Promise<void> {
  if (!cacheDriver?.close) {
    cacheDriver = null;
    return;
  }

  await cacheDriver.close();
  cacheDriver = null;
}

export function resetCacheDriverForTests(): void {
  cacheDriver = null;
}
