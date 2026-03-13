/**
 * Document AI Cache Service
 * Provides caching for document AI operations to avoid redundant LLM calls
 */

import crypto from 'crypto';
import { createLogger } from '@core/logger';
import { documentAIConfig } from '@config/env';

const logger = createLogger('document-ai-cache');

// In-memory cache (consider Redis for production at scale)
const cache = new Map<string, { data: unknown; expiresAt: number }>();

const DEFAULT_TTL_MS = documentAIConfig.cacheTtlMs;
const CLEANUP_INTERVAL_MS = documentAIConfig.cacheCleanupIntervalMs;

// Start periodic cleanup
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  let expiredCount = 0;

  for (const [key, value] of cache.entries()) {
    if (value.expiresAt < now) {
      cache.delete(key);
      expiredCount++;
    }
  }

  if (expiredCount > 0) {
    logger.debug({ expiredCount, remainingSize: cache.size }, 'Cache cleanup completed');
  }
}, CLEANUP_INTERVAL_MS);

// Prevent timer from keeping process alive
cleanupTimer.unref();

export interface CacheKeyParams {
  documentId: string;
  contentHash: string;
  operation: 'summary' | 'keywords' | 'entities' | 'topics' | 'generation';
  promptVersion: string;
  options?: Record<string, unknown>;
}

export const documentAiCacheService = {
  /**
   * Generate MD5 hash of content for cache key
   */
  hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  },

  /**
   * Generate a unique cache key from parameters
   */
  generateKey(params: CacheKeyParams): string {
    const optionsStr = params.options ? JSON.stringify(params.options) : '';
    const optionsHash = optionsStr
      ? crypto.createHash('md5').update(optionsStr).digest('hex').slice(0, 8)
      : 'default';

    return `doc-ai:${params.operation}:${params.documentId}:${params.contentHash.slice(0, 12)}:v${params.promptVersion}:${optionsHash}`;
  },

  /**
   * Get cached value if exists and not expired
   */
  get<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt < Date.now()) {
      cache.delete(key);
      return null;
    }

    logger.debug({ key }, 'Cache hit');
    return entry.data as T;
  },

  /**
   * Set cache value with TTL
   */
  set(key: string, data: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
    cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    logger.debug({ key, ttlMs, cacheSize: cache.size }, 'Cache set');
  },

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = cache.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt < Date.now()) {
      cache.delete(key);
      return false;
    }

    return true;
  },

  /**
   * Delete a specific cache entry
   */
  delete(key: string): boolean {
    return cache.delete(key);
  },

  /**
   * Invalidate all cache entries for a specific document
   * Call this when document content is updated
   */
  invalidateDocument(documentId: string): number {
    let deletedCount = 0;

    for (const key of cache.keys()) {
      if (key.includes(`:${documentId}:`)) {
        cache.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info({ documentId, deletedCount }, 'Document cache invalidated');
    }

    return deletedCount;
  },

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = cache.size;
    cache.clear();
    logger.info({ clearedEntries: size }, 'Cache cleared');
  },

  /**
   * Get cache statistics
   */
  getStats(): { size: number; memoryEstimate: number } {
    let memoryEstimate = 0;

    for (const [key, value] of cache.entries()) {
      // Rough estimate: key length + serialized data length
      memoryEstimate += key.length * 2; // UTF-16
      memoryEstimate += JSON.stringify(value.data).length * 2;
    }

    return {
      size: cache.size,
      memoryEstimate,
    };
  },

  /**
   * Get or compute cached value
   * Useful pattern for cache-aside strategy
   */
  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS
  ): Promise<{ data: T; cached: boolean }> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return { data: cached, cached: true };
    }

    const data = await compute();
    this.set(key, data, ttlMs);
    return { data, cached: false };
  },
};
