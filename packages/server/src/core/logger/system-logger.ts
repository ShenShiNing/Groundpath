import { createLogger } from '@core/logger';
import { systemLogRepository, type CreateSystemLogInput } from '@modules/logs';
import type { LogLevel, LogCategory } from '@core/db/schema/system/system-logs.schema';

const logger = createLogger('system-logger');

export interface LogSystemEventParams {
  level: LogLevel;
  category: LogCategory;
  event: string;
  message: string;
  source?: string | null;
  traceId?: string | null;
  errorCode?: string | null;
  errorStack?: string | null;
  durationMs?: number | null;
  metadata?: unknown;
}

/**
 * Log a system event asynchronously (fire-and-forget)
 * Errors are caught and logged but do not block the main flow
 */
export function logSystemEvent(params: LogSystemEventParams): void {
  const input: CreateSystemLogInput = {
    ...params,
  };

  systemLogRepository.create(input).catch((error) => {
    logger.warn(
      {
        event: params.event,
        category: params.category,
        error,
      },
      'Failed to log system event'
    );
  });
}

/**
 * Helper functions for common system events
 */
export const systemLogger = {
  startup(message: string, metadata?: unknown): void {
    logSystemEvent({
      level: 'info',
      category: 'startup',
      event: 'server.start',
      message,
      source: 'main',
      metadata,
    });
  },

  shutdown(message: string, metadata?: unknown): void {
    logSystemEvent({
      level: 'info',
      category: 'startup',
      event: 'server.shutdown',
      message,
      source: 'main',
      metadata,
    });
  },

  schedulerRun(event: string, message: string, durationMs?: number, metadata?: unknown): void {
    logSystemEvent({
      level: 'info',
      category: 'scheduler',
      event,
      message,
      source: 'scheduler',
      durationMs,
      metadata,
    });
  },

  schedulerError(event: string, error: Error, metadata?: unknown): void {
    logSystemEvent({
      level: 'error',
      category: 'scheduler',
      event,
      message: error.message,
      source: 'scheduler',
      errorCode: error.name,
      errorStack: error.stack,
      metadata,
    });
  },

  securityEvent(event: string, message: string, metadata?: unknown): void {
    logSystemEvent({
      level: 'warn',
      category: 'security',
      event,
      message,
      source: 'security',
      metadata,
    });
  },

  databaseEvent(
    event: string,
    message: string,
    level: LogLevel = 'info',
    metadata?: unknown
  ): void {
    logSystemEvent({
      level,
      category: 'database',
      event,
      message,
      source: 'database',
      metadata,
    });
  },

  performanceEvent(event: string, message: string, durationMs: number, metadata?: unknown): void {
    logSystemEvent({
      level: 'info',
      category: 'performance',
      event,
      message,
      source: 'performance',
      durationMs,
      metadata,
    });
  },
};

// Re-export types for convenience
export type { LogLevel, LogCategory };
