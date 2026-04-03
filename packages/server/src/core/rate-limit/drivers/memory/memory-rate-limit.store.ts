import { buildRedisKey } from '@core/redis';
import type { RateLimitStore, RateLimitWindowState } from '../../types';

interface MemoryWindowEntry {
  count: number;
  expiresAt: number;
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, MemoryWindowEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private resolveKey(key: string): string {
    return buildRedisKey(key);
  }

  private getActiveEntry(resolvedKey: string): MemoryWindowEntry | undefined {
    const entry = this.entries.get(resolvedKey);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt > this.now()) {
      return entry;
    }

    this.entries.delete(resolvedKey);
    return undefined;
  }

  async incrementWindow(key: string, windowMs: number): Promise<RateLimitWindowState> {
    const resolvedKey = this.resolveKey(key);
    const now = this.now();
    const current = this.getActiveEntry(resolvedKey);

    if (!current) {
      const entry = {
        count: 1,
        expiresAt: now + windowMs,
      };
      this.entries.set(resolvedKey, entry);
      return { count: entry.count, ttlMs: windowMs };
    }

    current.count += 1;
    return {
      count: current.count,
      ttlMs: Math.max(current.expiresAt - now, 0),
    };
  }

  async reset(key: string): Promise<void> {
    this.entries.delete(this.resolveKey(key));
  }

  async ping(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}

export function createMemoryRateLimitStore(): RateLimitStore {
  return new MemoryRateLimitStore();
}
