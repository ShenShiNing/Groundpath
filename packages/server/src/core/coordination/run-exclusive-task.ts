import { coordinationConfig } from '@config/env';
import type { Logger } from 'pino';
import { getCoordinationDriver } from './driver';
import type { CoordinationLock } from './types';

type LoggerLike = Pick<Logger, 'info' | 'warn'>;

interface RunExclusiveTaskOptions<Result> {
  key: string;
  ttlMs?: number;
  renewIntervalMs?: number;
  logger?: LoggerLike;
  lockBusyMessage?: string;
  lockLostMessage?: string;
  releaseFailedMessage?: string;
  onLocked?: () => Result | Promise<Result>;
}

async function startLockHeartbeat(
  lock: CoordinationLock,
  ttlMs: number,
  renewIntervalMs: number,
  logger?: LoggerLike,
  lockLostMessage?: string
): Promise<() => void> {
  if (!lock.extend || renewIntervalMs <= 0) {
    return () => undefined;
  }

  let stopped = false;
  let inFlight = false;
  const timer = setInterval(() => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    void lock.extend!(ttlMs)
      .then((extended) => {
        if (!extended) {
          logger?.warn({ key: lock.key }, lockLostMessage ?? 'Coordination lock was lost');
        }
      })
      .catch((error) => {
        logger?.warn(
          { key: lock.key, error },
          lockLostMessage ?? 'Failed to extend coordination lock'
        );
      })
      .finally(() => {
        inFlight = false;
      });
  }, renewIntervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export async function runExclusiveTask<Result>(
  task: () => Promise<Result>,
  options: RunExclusiveTaskOptions<Result>
): Promise<Result> {
  const ttlMs = options.ttlMs ?? coordinationConfig.scheduledTaskLockTtlMs;
  const renewIntervalMs =
    options.renewIntervalMs ?? coordinationConfig.scheduledTaskLockRenewIntervalMs;
  const lock = await getCoordinationDriver().acquireLock(options.key, ttlMs);

  if (!lock) {
    options.logger?.info({ key: options.key }, options.lockBusyMessage ?? 'Skipping locked task');
    if (options.onLocked) {
      return await options.onLocked();
    }

    throw new Error(`Coordination lock is already held: ${options.key}`);
  }

  const stopHeartbeat = await startLockHeartbeat(
    lock,
    ttlMs,
    renewIntervalMs,
    options.logger,
    options.lockLostMessage
  );

  try {
    return await task();
  } finally {
    stopHeartbeat();
    try {
      await lock.release();
    } catch (error) {
      options.logger?.warn(
        { key: options.key, error },
        options.releaseFailedMessage ?? 'Failed to release coordination lock'
      );
    }
  }
}
