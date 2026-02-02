import { createLogger } from '@shared/logger';

const logger = createLogger('cache.service');

// ============================================================================
// Types
// ============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

interface CacheOptions {
  /** Default TTL in seconds (default: 300 = 5 minutes) */
  defaultTtl?: number;
  /** Maximum number of entries (default: 1000) */
  maxSize?: number;
  /** Cleanup interval in milliseconds (default: 60000 = 1 minute) */
  cleanupInterval?: number;
}

// ============================================================================
// Cache Service
// ============================================================================

/**
 * Simple in-memory cache with TTL support
 *
 * For production with multiple server instances, consider using Redis.
 * This implementation is suitable for single-instance deployments.
 */
class CacheService {
  private cache = new Map<string, CacheEntry<unknown>>();
  private stats: CacheStats = { hits: 0, misses: 0, size: 0 };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private defaultTtl: number;
  private maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.defaultTtl ?? 300;
    this.maxSize = options.maxSize ?? 1000;

    // Start cleanup timer
    const cleanupInterval = options.cleanupInterval ?? 60000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);

    // Prevent timer from keeping process alive
    this.cleanupTimer.unref?.();
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.size = this.cache.size;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttlSeconds TTL in seconds (optional, uses default if not specified)
   */
  set<T>(key: string, value: T, ttlSeconds?: number): void {
    // Evict oldest entries if at max size
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    const ttl = ttlSeconds ?? this.defaultTtl;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
    this.stats.size = this.cache.size;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return deleted;
  }

  /**
   * Delete all keys matching a pattern (simple prefix match)
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.size = this.cache.size;
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0%';
    return { ...this.stats, hitRate };
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.stats.size = this.cache.size;
      logger.debug({ expiredCount, remaining: this.cache.size }, 'Cache cleanup completed');
    }
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    // Simple FIFO eviction - delete first 10% of entries
    const toEvict = Math.max(1, Math.floor(this.maxSize * 0.1));
    let evicted = 0;

    for (const key of this.cache.keys()) {
      if (evicted >= toEvict) break;
      this.cache.delete(key);
      evicted++;
    }

    logger.debug({ evicted }, 'Cache eviction completed');
  }

  /**
   * Shutdown the cache service
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}

// ============================================================================
// Cache Key Builders
// ============================================================================

/**
 * Helper functions to build consistent cache keys
 */
export const cacheKeys = {
  user: (userId: string) => `user:${userId}`,
  userByEmail: (email: string) => `user:email:${email.toLowerCase()}`,
  knowledgeBase: (kbId: string) => `kb:${kbId}`,
  knowledgeBaseEmbeddingConfig: (kbId: string) => `kb:${kbId}:embedding`,
  userKnowledgeBases: (userId: string) => `kb:user:${userId}`,
  document: (docId: string) => `doc:${docId}`,
  folder: (folderId: string) => `folder:${folderId}`,
};

/**
 * Invalidation helpers
 */
export const invalidatePatterns = {
  user: (userId: string) => `user:${userId}`,
  knowledgeBase: (kbId: string) => `kb:${kbId}`,
  userKnowledgeBases: (userId: string) => `kb:user:${userId}`,
};

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default cache instance with 5-minute TTL
 */
export const cacheService = new CacheService({
  defaultTtl: 300, // 5 minutes
  maxSize: 1000,
  cleanupInterval: 60000, // 1 minute
});

/**
 * Short-lived cache for high-frequency queries (30 seconds TTL)
 */
export const shortCache = new CacheService({
  defaultTtl: 30,
  maxSize: 500,
  cleanupInterval: 30000,
});

export { CacheService };
