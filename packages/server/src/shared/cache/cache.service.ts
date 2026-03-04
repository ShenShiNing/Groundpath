import { createLogger } from '@shared/logger';
import { buildRedisKey, getRedisClient } from '@shared/redis';

const logger = createLogger('cache.service');

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

interface CacheOptions {
  /** Default TTL in seconds (default: 300 = 5 minutes) */
  defaultTtl?: number;
  /** Cache namespace to avoid key collisions */
  namespace: string;
}

class CacheService {
  private stats: CacheStats = { hits: 0, misses: 0, size: 0 };
  private readonly defaultTtl: number;
  private readonly namespace: string;

  constructor(options: CacheOptions) {
    this.defaultTtl = options.defaultTtl ?? 300;
    this.namespace = options.namespace;
  }

  private key(key: string): string {
    return buildRedisKey(`${this.namespace}:${key}`);
  }

  private pattern(prefix: string): string {
    return buildRedisKey(`${this.namespace}:${prefix}*`);
  }

  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    const value = await redis.get(this.key(key));

    if (!value) {
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.warn({ key, err: error }, 'Invalid cache payload, deleting key');
      await this.delete(key);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const redis = getRedisClient();
    const ttl = ttlSeconds ?? this.defaultTtl;
    await redis.set(this.key(key), JSON.stringify(value), 'EX', ttl);
  }

  async delete(key: string): Promise<boolean> {
    const redis = getRedisClient();
    const deleted = await redis.del(this.key(key));
    return deleted > 0;
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    const redis = getRedisClient();
    let totalDeleted = 0;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        this.pattern(prefix),
        'COUNT',
        200
      );
      cursor = nextCursor;

      if (keys.length === 0) {
        continue;
      }

      totalDeleted += await redis.del(...keys);
    } while (cursor !== '0');

    return totalDeleted;
  }

  async clear(): Promise<void> {
    await this.deleteByPrefix('');
  }

  async getStats(): Promise<CacheStats & { hitRate: string }> {
    let size = 0;
    let cursor = '0';
    const redis = getRedisClient();

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', this.pattern(''), 'COUNT', 200);
      cursor = nextCursor;
      size += keys.length;
    } while (cursor !== '0');

    this.stats.size = size;
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0%';

    return { ...this.stats, hitRate };
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

export const cacheKeys = {
  user: (userId: string) => `user:${userId}`,
  userByEmail: (email: string) => `user:email:${email.toLowerCase()}`,
  knowledgeBase: (kbId: string) => `kb:${kbId}`,
  knowledgeBaseEmbeddingConfig: (kbId: string) => `kb:${kbId}:embedding`,
  userKnowledgeBases: (userId: string) => `kb:user:${userId}`,
  document: (docId: string) => `doc:${docId}`,
};

export const invalidatePatterns = {
  user: (userId: string) => `user:${userId}`,
  knowledgeBase: (kbId: string) => `kb:${kbId}`,
  userKnowledgeBases: (userId: string) => `kb:user:${userId}`,
};

export const cacheService = new CacheService({
  defaultTtl: 300,
  namespace: 'cache',
});

export const shortCache = new CacheService({
  defaultTtl: 30,
  namespace: 'short-cache',
});

export { CacheService };
