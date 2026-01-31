import pino from 'pino';
import { env } from '@config/env';

const logLevel =
  env.NODE_ENV === 'test'
    ? 'silent'
    : (env.LOG_LEVEL ?? (env.NODE_ENV === 'development' ? 'debug' : 'info'));

export const logger = pino({
  level: logLevel,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  redact: ['req.headers.authorization', '*.password', '*.refreshToken', '*.accessToken'],
});

/**
 * Create a child logger with a module name
 */
export function createLogger(module: string) {
  return logger.child({ module });
}
