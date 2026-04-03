import type { RateLimitStore, RateLimitWindowState } from '../../types';

class NoopRateLimitStore implements RateLimitStore {
  async incrementWindow(_key: string, windowMs: number): Promise<RateLimitWindowState> {
    return {
      count: 1,
      ttlMs: windowMs,
    };
  }

  async reset(_key: string): Promise<void> {
    return;
  }

  async ping(): Promise<void> {
    return;
  }
}

export function createNoopRateLimitStore(): RateLimitStore {
  return new NoopRateLimitStore();
}
