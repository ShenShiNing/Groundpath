import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShutdownHandler } from '@shared/server/shutdown';

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe('shared/server/shutdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should close resources and exit with code 0 on graceful shutdown', async () => {
    const closeDatabaseMock = vi.fn().mockResolvedValue(undefined);
    const closeRedisMock = vi.fn().mockResolvedValue(undefined);
    const exitMock = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const server = {
      close: vi.fn((cb: (err?: Error) => void) => {
        setTimeout(() => cb(), 0);
      }),
    } as unknown as Pick<Server, 'close'>;

    const handler = createShutdownHandler(server, {
      closeDatabase: closeDatabaseMock,
      closeRedis: closeRedisMock,
      logger,
      shutdownTimeout: 3000,
      exit: exitMock,
    });

    handler('SIGTERM');
    vi.advanceTimersByTime(0);
    await flushMicrotasks();

    expect(closeDatabaseMock).toHaveBeenCalledTimes(1);
    expect(closeRedisMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(0);

    vi.advanceTimersByTime(3000);
    expect(logger.warn).not.toHaveBeenCalledWith('Forced shutdown due to timeout');
    expect(exitMock).toHaveBeenCalledTimes(1);
  });

  it('should exit with code 1 when server.close returns error', async () => {
    const closeDatabaseMock = vi.fn().mockResolvedValue(undefined);
    const closeRedisMock = vi.fn().mockResolvedValue(undefined);
    const exitMock = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const serverCloseError = new Error('close failed');
    const server = {
      close: vi.fn((cb: (err?: Error) => void) => {
        setTimeout(() => cb(serverCloseError), 0);
      }),
    } as unknown as Pick<Server, 'close'>;

    const handler = createShutdownHandler(server, {
      closeDatabase: closeDatabaseMock,
      closeRedis: closeRedisMock,
      logger,
      shutdownTimeout: 3000,
      exit: exitMock,
    });

    handler('SIGINT');
    vi.advanceTimersByTime(0);
    await flushMicrotasks();

    expect(closeDatabaseMock).not.toHaveBeenCalled();
    expect(closeRedisMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      { err: serverCloseError },
      'Error during server shutdown'
    );
    expect(exitMock).toHaveBeenCalledWith(1);

    vi.advanceTimersByTime(3000);
    expect(exitMock).toHaveBeenCalledTimes(1);
  });

  it('should continue shutdown and exit 0 when database close fails', async () => {
    const dbError = new Error('db close failed');
    const closeDatabaseMock = vi.fn().mockRejectedValue(dbError);
    const closeRedisMock = vi.fn().mockResolvedValue(undefined);
    const exitMock = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const server = {
      close: vi.fn((cb: (err?: Error) => void) => {
        setTimeout(() => cb(), 0);
      }),
    } as unknown as Pick<Server, 'close'>;

    const handler = createShutdownHandler(server, {
      closeDatabase: closeDatabaseMock,
      closeRedis: closeRedisMock,
      logger,
      shutdownTimeout: 3000,
      exit: exitMock,
    });

    handler('SIGTERM');
    vi.advanceTimersByTime(0);
    await flushMicrotasks();

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError },
      'Error closing database connections'
    );
    expect(closeRedisMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(0);
  });

  it('should continue shutdown and exit 0 when redis close fails', async () => {
    const redisError = new Error('redis close failed');
    const closeDatabaseMock = vi.fn().mockResolvedValue(undefined);
    const closeRedisMock = vi.fn().mockRejectedValue(redisError);
    const exitMock = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const server = {
      close: vi.fn((cb: (err?: Error) => void) => {
        setTimeout(() => cb(), 0);
      }),
    } as unknown as Pick<Server, 'close'>;

    const handler = createShutdownHandler(server, {
      closeDatabase: closeDatabaseMock,
      closeRedis: closeRedisMock,
      logger,
      shutdownTimeout: 3000,
      exit: exitMock,
    });

    handler('SIGTERM');
    vi.advanceTimersByTime(0);
    await flushMicrotasks();

    expect(logger.error).toHaveBeenCalledWith(
      { err: redisError },
      'Error closing Redis connection'
    );
    expect(exitMock).toHaveBeenCalledWith(0);
  });

  it('should force exit with code 1 when shutdown exceeds timeout', () => {
    const closeDatabaseMock = vi.fn().mockResolvedValue(undefined);
    const closeRedisMock = vi.fn().mockResolvedValue(undefined);
    const exitMock = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const server = {
      close: vi.fn(),
    } as unknown as Pick<Server, 'close'>;

    const handler = createShutdownHandler(server, {
      closeDatabase: closeDatabaseMock,
      closeRedis: closeRedisMock,
      logger,
      shutdownTimeout: 1200,
      exit: exitMock,
    });

    handler('SIGTERM');

    vi.advanceTimersByTime(1200);

    expect(logger.warn).toHaveBeenCalledWith('Forced shutdown due to timeout');
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(closeDatabaseMock).not.toHaveBeenCalled();
    expect(closeRedisMock).not.toHaveBeenCalled();
  });
});
