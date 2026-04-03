import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Errors } from '@core/errors';
import { executeExternalCall } from '@core/utils/external-call';

describe('executeExternalCall', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('retries retryable status errors and eventually succeeds', async () => {
    vi.useFakeTimers();
    const execute = vi
      .fn<(_: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(Errors.external('temporary', undefined, 503))
      .mockResolvedValueOnce('ok');

    const promise = executeExternalCall({
      service: 'test',
      operation: 'retryable',
      policy: { timeoutMs: 1000, maxRetries: 2, baseDelayMs: 100, maxDelayMs: 1000 },
      execute,
    });

    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe('ok');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable status errors', async () => {
    const execute = vi
      .fn<(_: AbortSignal) => Promise<string>>()
      .mockRejectedValue(Errors.external('bad request', undefined, 400));

    await expect(
      executeExternalCall({
        service: 'test',
        operation: 'non-retryable',
        policy: { timeoutMs: 1000, maxRetries: 2, baseDelayMs: 100, maxDelayMs: 1000 },
        execute,
      })
    ).rejects.toThrow('bad request');

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('converts timeout aborts into timeout errors that can be retried', async () => {
    vi.useFakeTimers();
    const execute = vi
      .fn<(_: AbortSignal) => Promise<string>>()
      .mockImplementationOnce(
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true }
            );
          })
      )
      .mockResolvedValueOnce('recovered');

    const promise = executeExternalCall({
      service: 'test',
      operation: 'timeout',
      policy: { timeoutMs: 1000, maxRetries: 1, baseDelayMs: 100, maxDelayMs: 1000 },
      execute,
    });

    await vi.advanceTimersByTimeAsync(1100);
    await expect(promise).resolves.toBe('recovered');
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
