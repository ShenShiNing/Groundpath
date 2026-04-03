import { buildRedisKey, getRedisClient } from '@core/redis';
import type { CacheDriver } from '../../types';

class RedisCacheDriver implements CacheDriver {
  async get(key: string): Promise<string | null> {
    return getRedisClient().get(buildRedisKey(key));
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await getRedisClient().set(buildRedisKey(key), value, 'EX', ttlSeconds);
  }

  async delete(key: string): Promise<boolean> {
    const deleted = await getRedisClient().del(buildRedisKey(key));
    return deleted > 0;
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    const redis = getRedisClient();
    let totalDeleted = 0;
    let cursor = '0';
    const matchPattern = `${buildRedisKey(prefix)}*`;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', matchPattern, 'COUNT', 200);
      cursor = nextCursor;

      if (keys.length === 0) {
        continue;
      }

      totalDeleted += await redis.del(...keys);
    } while (cursor !== '0');

    return totalDeleted;
  }

  async countByPrefix(prefix: string): Promise<number> {
    const redis = getRedisClient();
    let size = 0;
    let cursor = '0';
    const matchPattern = `${buildRedisKey(prefix)}*`;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', matchPattern, 'COUNT', 200);
      cursor = nextCursor;
      size += keys.length;
    } while (cursor !== '0');

    return size;
  }

  async ping(): Promise<void> {
    await getRedisClient().ping();
  }
}

export function createRedisCacheDriver(): CacheDriver {
  return new RedisCacheDriver();
}
