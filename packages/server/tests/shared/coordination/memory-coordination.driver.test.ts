import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryCoordinationDriver } from '@core/coordination/drivers/memory/memory-coordination.driver';

describe('memory-coordination.driver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prevents concurrent acquisition and allows reacquire after release', async () => {
    const driver = createMemoryCoordinationDriver();

    const firstLock = await driver.acquireLock('vector:cleanup:lock', 10_000);
    const secondLock = await driver.acquireLock('vector:cleanup:lock', 10_000);

    expect(firstLock).not.toBeNull();
    expect(secondLock).toBeNull();

    await firstLock?.release();

    await expect(driver.acquireLock('vector:cleanup:lock', 10_000)).resolves.not.toBeNull();
  });

  it('allows reacquire after ttl expiry', async () => {
    const driver = createMemoryCoordinationDriver();

    await expect(driver.acquireLock('vector:cleanup:lock', 1_000)).resolves.not.toBeNull();

    vi.advanceTimersByTime(1_001);

    await expect(driver.acquireLock('vector:cleanup:lock', 1_000)).resolves.not.toBeNull();
  });
});
