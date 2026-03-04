import type { Server } from 'node:http';

type LogFn = (...args: unknown[]) => void;

export interface ShutdownLogger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

export interface ShutdownDependencies {
  closeDatabase: () => Promise<void>;
  closeRedis: () => Promise<void>;
  logger: ShutdownLogger;
  shutdownTimeout: number;
  exit: (code: number) => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

/**
 * Create graceful shutdown handler for SIGTERM/SIGINT.
 */
export function createShutdownHandler(
  server: Pick<Server, 'close'>,
  deps: ShutdownDependencies
): (signal: string) => void {
  const setTimer = deps.setTimeoutFn ?? setTimeout;
  const clearTimer = deps.clearTimeoutFn ?? clearTimeout;

  return (signal: string) => {
    deps.logger.info({ signal }, 'Received shutdown signal, closing server gracefully');

    const forceExitTimer = setTimer(() => {
      deps.logger.warn('Forced shutdown due to timeout');
      deps.exit(1);
    }, deps.shutdownTimeout);

    server.close(async (err?: Error) => {
      clearTimer(forceExitTimer);

      if (err) {
        deps.logger.error({ err }, 'Error during server shutdown');
        deps.exit(1);
        return;
      }

      try {
        await deps.closeDatabase();
        deps.logger.info('Database connections closed');
      } catch (dbErr) {
        deps.logger.error({ err: dbErr }, 'Error closing database connections');
      }

      try {
        await deps.closeRedis();
      } catch (redisErr) {
        deps.logger.error({ err: redisErr }, 'Error closing Redis connection');
      }

      deps.logger.info('Server closed successfully');
      deps.exit(0);
    });
  };
}
