export type RateLimitDriverName = 'redis' | 'memory' | 'noop';

export interface RateLimitWindowState {
  count: number;
  ttlMs: number;
}

export interface RateLimitStore {
  incrementWindow(key: string, windowMs: number): Promise<RateLimitWindowState>;
  reset(key: string): Promise<void>;
  ping?(): Promise<void>;
  close?(): Promise<void>;
}
