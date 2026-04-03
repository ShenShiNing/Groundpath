import { buildRedisKey } from '@core/redis';
import type { CacheDriver } from '../../types';

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

class MemoryCacheDriver implements CacheDriver {
  private readonly entries = new Map<string, MemoryCacheEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private resolveKey(key: string): string {
    return buildRedisKey(key);
  }

  private deleteIfExpired(resolvedKey: string): boolean {
    const entry = this.entries.get(resolvedKey);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt > this.now()) {
      return false;
    }

    this.entries.delete(resolvedKey);
    return true;
  }

  private sweepExpiredEntries(): void {
    for (const key of this.entries.keys()) {
      this.deleteIfExpired(key);
    }
  }

  async get(key: string): Promise<string | null> {
    const resolvedKey = this.resolveKey(key);
    if (this.deleteIfExpired(resolvedKey)) {
      return null;
    }

    return this.entries.get(resolvedKey)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const resolvedKey = this.resolveKey(key);
    this.entries.set(resolvedKey, {
      value,
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.entries.delete(this.resolveKey(key));
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    this.sweepExpiredEntries();
    const resolvedPrefix = this.resolveKey(prefix);
    let deletedCount = 0;

    for (const key of this.entries.keys()) {
      if (!key.startsWith(resolvedPrefix)) {
        continue;
      }

      this.entries.delete(key);
      deletedCount += 1;
    }

    return deletedCount;
  }

  async countByPrefix(prefix: string): Promise<number> {
    this.sweepExpiredEntries();
    const resolvedPrefix = this.resolveKey(prefix);
    let count = 0;

    for (const key of this.entries.keys()) {
      if (key.startsWith(resolvedPrefix)) {
        count += 1;
      }
    }

    return count;
  }

  async ping(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}

export function createMemoryCacheDriver(): CacheDriver {
  return new MemoryCacheDriver();
}
