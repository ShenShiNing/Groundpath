import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryCacheDriver } from '@core/cache/drivers/memory/memory-cache.driver';

describe('memory-cache.driver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores values, counts prefixes, and deletes by prefix', async () => {
    const driver = createMemoryCacheDriver();

    await driver.set('cache:user:1', '{"id":1}', 60);
    await driver.set('cache:user:2', '{"id":2}', 60);
    await driver.set('short-cache:doc:1', '{"id":"doc"}', 60);

    await expect(driver.get('cache:user:1')).resolves.toBe('{"id":1}');
    await expect(driver.countByPrefix('cache:user:')).resolves.toBe(2);
    await expect(driver.deleteByPrefix('cache:user:')).resolves.toBe(2);
    await expect(driver.countByPrefix('cache:user:')).resolves.toBe(0);
    await expect(driver.get('short-cache:doc:1')).resolves.toBe('{"id":"doc"}');
  });

  it('expires entries based on ttl', async () => {
    const driver = createMemoryCacheDriver();

    await driver.set('cache:user:expiring', '{"id":"expiring"}', 1);
    await expect(driver.get('cache:user:expiring')).resolves.toBe('{"id":"expiring"}');

    vi.advanceTimersByTime(1_001);

    await expect(driver.get('cache:user:expiring')).resolves.toBeNull();
    await expect(driver.countByPrefix('cache:user:')).resolves.toBe(0);
  });
});
