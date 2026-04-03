import { redisConfig } from '@config/env';

export function normalizeRedisPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
}

export function buildRedisKey(key: string): string {
  return `${normalizeRedisPrefix(redisConfig.prefix)}${key}`;
}
