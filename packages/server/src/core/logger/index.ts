import pino from 'pino';
import { serverConfig, loggingConfig } from '@config/env';

const logLevel =
  serverConfig.nodeEnv === 'test'
    ? 'silent'
    : (loggingConfig.level ?? (serverConfig.nodeEnv === 'development' ? 'debug' : 'info'));

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
  // 增强脱敏配置
  redact: {
    paths: [
      // 认证相关
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.oldPassword',
      '*.newPassword',
      '*.refreshToken',
      '*.accessToken',
      '*.token',
      // API 密钥
      '*.apiKey',
      '*.apiSecret',
      '*.secret',
      '*.secretKey',
      // 敏感个人信息
      '*.creditCard',
      '*.ssn',
      '*.idCard',
    ],
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
