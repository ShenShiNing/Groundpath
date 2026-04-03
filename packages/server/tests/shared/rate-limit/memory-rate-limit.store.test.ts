import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRateLimitStore } from '@core/rate-limit/drivers/memory/memory-rate-limit.store';

describe('memory-rate-limit.store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('increments within the same window and resets after expiry', async () => {
    const store = createMemoryRateLimitStore();

    await expect(store.incrementWindow('ratelimit:test:user-1', 5_000)).resolves.toEqual({
      count: 1,
      ttlMs: 5_000,
    });
    await expect(store.incrementWindow('ratelimit:test:user-1', 5_000)).resolves.toMatchObject({
      count: 2,
    });

    vi.advanceTimersByTime(5_001);

    await expect(store.incrementWindow('ratelimit:test:user-1', 5_000)).resolves.toEqual({
      count: 1,
      ttlMs: 5_000,
    });
  });

  it('resets counters explicitly', async () => {
    const store = createMemoryRateLimitStore();

    await store.incrementWindow('ratelimit:test:user-2', 10_000);
    await store.reset('ratelimit:test:user-2');

    await expect(store.incrementWindow('ratelimit:test:user-2', 10_000)).resolves.toEqual({
      count: 1,
      ttlMs: 10_000,
    });
  });
});
