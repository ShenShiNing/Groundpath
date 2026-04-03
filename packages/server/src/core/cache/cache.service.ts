import { createLogger } from '@core/logger';
import { getCacheDriver } from './driver';

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
    return `${this.namespace}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await getCacheDriver().get(this.key(key));

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
    const ttl = ttlSeconds ?? this.defaultTtl;
    await getCacheDriver().set(this.key(key), JSON.stringify(value), ttl);
  }

  async delete(key: string): Promise<boolean> {
    return getCacheDriver().delete(this.key(key));
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    return getCacheDriver().deleteByPrefix(this.key(prefix));
  }

  async clear(): Promise<void> {
    await this.deleteByPrefix('');
  }

  async getStats(): Promise<CacheStats & { hitRate: string }> {
    this.stats.size = await getCacheDriver().countByPrefix(this.key(''));
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

export type { CacheOptions as CacheServiceOptions };
export { CacheService };
