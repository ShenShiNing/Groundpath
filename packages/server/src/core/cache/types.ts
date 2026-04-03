export type CacheDriverName = 'redis' | 'memory';

export interface CacheDriver {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteByPrefix(prefix: string): Promise<number>;
  countByPrefix(prefix: string): Promise<number>;
  ping?(): Promise<void>;
  close?(): Promise<void>;
}
