import { randomUUID } from 'node:crypto';
import { buildRedisKey, getRedisClient } from '@core/redis';
import type { CoordinationDriver, CoordinationLock } from '../../types';

const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

const EXTEND_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0
`;

class RedisCoordinationDriver implements CoordinationDriver {
  async acquireLock(key: string, ttlMs: number): Promise<CoordinationLock | null> {
    const token = randomUUID();
    const resolvedKey = buildRedisKey(key);
    const result = await getRedisClient().set(resolvedKey, token, 'PX', ttlMs, 'NX');

    if (result !== 'OK') {
      return null;
    }

    return {
      key,
      extend: async (nextTtlMs: number) => {
        const result = await getRedisClient().eval(
          EXTEND_LOCK_SCRIPT,
          1,
          resolvedKey,
          token,
          String(nextTtlMs)
        );
        return Number(result) === 1;
      },
      release: async () => {
        await getRedisClient().eval(RELEASE_LOCK_SCRIPT, 1, resolvedKey, token);
      },
    };
  }

  async ping(): Promise<void> {
    await getRedisClient().ping();
  }
}

export function createRedisCoordinationDriver(): CoordinationDriver {
  return new RedisCoordinationDriver();
}
