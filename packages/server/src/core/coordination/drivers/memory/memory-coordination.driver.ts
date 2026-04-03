import { randomUUID } from 'node:crypto';
import { buildRedisKey } from '@core/redis';
import type { CoordinationDriver, CoordinationLock } from '../../types';

interface MemoryLockEntry {
  token: string;
  expiresAt: number;
}

class MemoryCoordinationDriver implements CoordinationDriver {
  private readonly locks = new Map<string, MemoryLockEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private resolveKey(key: string): string {
    return buildRedisKey(key);
  }

  private getActiveEntry(resolvedKey: string): MemoryLockEntry | undefined {
    const entry = this.locks.get(resolvedKey);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt > this.now()) {
      return entry;
    }

    this.locks.delete(resolvedKey);
    return undefined;
  }

  async acquireLock(key: string, ttlMs: number): Promise<CoordinationLock | null> {
    const resolvedKey = this.resolveKey(key);
    if (this.getActiveEntry(resolvedKey)) {
      return null;
    }

    const token = randomUUID();
    this.locks.set(resolvedKey, {
      token,
      expiresAt: this.now() + ttlMs,
    });

    return {
      key,
      release: async () => {
        const current = this.locks.get(resolvedKey);
        if (current?.token === token) {
          this.locks.delete(resolvedKey);
        }
      },
    };
  }

  async ping(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    this.locks.clear();
  }
}

export function createMemoryCoordinationDriver(): CoordinationDriver {
  return new MemoryCoordinationDriver();
}
