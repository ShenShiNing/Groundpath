import Redis from 'ioredis';
import { redisConfig } from '@config/env';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';

const logger = createLogger('redis.client');

let redisClient: Redis | null = null;

function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[invalid-redis-url]';
  }
}

export function requireRedisUrl(): string {
  const url = redisConfig.url.trim();

  if (!url) {
    throw Errors.validation(
      'REDIS_URL is required when Redis-backed cache, queue, rate limiting, or coordination is enabled.'
    );
  }

  return url;
}

function createRedisClient(): Redis {
  const client = new Redis(requireRedisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  client.on('error', (error) => {
    logger.error({ err: error }, 'Redis client error');
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  const safeUrl = redactRedisUrl(requireRedisUrl());

  try {
    if (client.status !== 'ready') {
      await client.connect();
    }

    await client.ping();
    logger.info({ url: safeUrl }, 'Redis connected');
  } catch (error) {
    if (error instanceof Error && error.message.includes('NOAUTH')) {
      throw Errors.validation(
        'Redis authentication failed. Please set REDIS_URL with credentials, e.g. redis://:password@localhost:6379'
      );
    }
    throw error;
  }
}

export async function closeRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  if (redisClient.status !== 'end') {
    await redisClient.quit();
  }

  redisClient = null;
  logger.info('Redis connection closed');
}
