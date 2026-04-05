export type CoordinationDriverName = 'redis' | 'memory';

export interface CoordinationLock {
  key: string;
  extend?(ttlMs: number): Promise<boolean>;
  release(): Promise<void>;
}

export interface CoordinationDriver {
  acquireLock(key: string, ttlMs: number): Promise<CoordinationLock | null>;
  ping?(): Promise<void>;
  close?(): Promise<void>;
}
