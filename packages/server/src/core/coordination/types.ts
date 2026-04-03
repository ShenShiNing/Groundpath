export type CoordinationDriverName = 'redis' | 'memory';

export interface CoordinationLock {
  key: string;
  release(): Promise<void>;
}

export interface CoordinationDriver {
  acquireLock(key: string, ttlMs: number): Promise<CoordinationLock | null>;
  ping?(): Promise<void>;
  close?(): Promise<void>;
}
