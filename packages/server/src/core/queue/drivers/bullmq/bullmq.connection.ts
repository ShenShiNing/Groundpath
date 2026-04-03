import type { ConnectionOptions } from 'bullmq';

export function createBullmqConnection(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    lazyConnect: true,
  };
}

export function buildBullmqPrefix(redisPrefix: string): string {
  return `${redisPrefix}:queue`;
}
