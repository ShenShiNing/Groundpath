import Redis from 'ioredis';
import { redisConfig } from '@config/env';
import { createLogger } from '@shared/logger';

const logger = createLogger('redis.client');

let redisClient: Redis | null = null;

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
}

function createRedisClient(): Redis {
  const client = new Redis(redisConfig.url, {
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

  if (client.status !== 'ready') {
    await client.connect();
  }

  await client.ping();
  logger.info({ url: redisConfig.url }, 'Redis connected');
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

export function buildRedisKey(key: string): string {
  return `${normalizePrefix(redisConfig.prefix)}${key}`;
}

