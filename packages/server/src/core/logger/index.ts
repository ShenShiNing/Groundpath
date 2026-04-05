import pino from 'pino';
import { serverConfig, loggingConfig } from '@config/env';
import { sanitizeLogMetadata, summarizeErrorForLog } from './redaction';

const logLevel =
  serverConfig.nodeEnv === 'test'
    ? 'silent'
    : (loggingConfig.level ?? (serverConfig.nodeEnv === 'development' ? 'debug' : 'info'));

export const LOGGER_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.oldPassword',
  '*.newPassword',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
  '*.apiKey',
  '*.apiSecret',
  '*.secret',
  '*.secretKey',
  '*.email',
  '*.ip',
  '*.ipAddress',
  '*.userAgent',
  '*.query',
  '*.response',
  '*.prompt',
  '*.body',
  '*.creditCard',
  '*.ssn',
  '*.idCard',
] as const;

export const logger = pino({
  level: logLevel,
  transport:
    serverConfig.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  serializers: {
    err: summarizeErrorForLog,
    error: summarizeErrorForLog,
  },
  formatters: {
    log: (object) => sanitizeLogMetadata(object) as Record<string, unknown>,
  },
  redact: {
    paths: [...LOGGER_REDACT_PATHS],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with a module name and optional bindings
 */
export function createLogger(module: string, bindings?: Record<string, unknown>) {
  return logger.child({ module, ...bindings });
}

/**
 * Create a request-scoped logger with requestId
 */
export function createRequestLogger(module: string, requestId?: string) {
  return logger.child({ module, requestId });
}
