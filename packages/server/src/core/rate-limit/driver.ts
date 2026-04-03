import { rateLimitConfig } from '@config/env';
import { createMemoryRateLimitStore } from './drivers/memory/memory-rate-limit.store';
import { createNoopRateLimitStore } from './drivers/noop/noop-rate-limit.store';
import { createRedisRateLimitStore } from './drivers/redis/redis-rate-limit.store';
import type { RateLimitStore } from './types';

let rateLimitStore: RateLimitStore | null = null;

function createConfiguredRateLimitStore(): RateLimitStore {
  switch (rateLimitConfig.driver) {
    case 'memory':
      return createMemoryRateLimitStore();
    case 'noop':
      return createNoopRateLimitStore();
    case 'redis':
    default:
      return createRedisRateLimitStore();
  }
}

export function getRateLimitStore(): RateLimitStore {
  if (!rateLimitStore) {
    rateLimitStore = createConfiguredRateLimitStore();
  }

  return rateLimitStore;
}

export async function closeRateLimitStore(): Promise<void> {
  if (!rateLimitStore?.close) {
    rateLimitStore = null;
    return;
  }

  await rateLimitStore.close();
  rateLimitStore = null;
}

export function resetRateLimitStoreForTests(): void {
  rateLimitStore = null;
}
