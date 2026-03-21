import type { ConnectionOptions } from 'bullmq';
import { redisConfig } from '@config/env';

/**
 * Parse the Redis URL into BullMQ-compatible connection options.
 *
 * BullMQ manages its own ioredis connections internally, so we provide
 * connection options rather than sharing the application's Redis client.
 */
export function getQueueConnection(): ConnectionOptions {
  const parsed = new URL(redisConfig.url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    lazyConnect: true,
  };
}

/**
 * Build a prefixed queue name to avoid collisions across environments.
 */
export function getQueuePrefix(): string {
  return `${redisConfig.prefix}:queue`;
}
