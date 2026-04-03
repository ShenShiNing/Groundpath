import { describe, expect, it, vi } from 'vitest';
import { createInlineQueueDriver } from '@core/queue/drivers/inline/inline.driver';

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number = 2_000,
  intervalMs: number = 10
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out waiting for inline queue condition');
}

describe('inline queue driver', () => {
  it('deduplicates jobs by jobId and exposes queued payloads through the inspector', async () => {
    const driver = createInlineQueueDriver();
    const channel = driver.createChannel<{ value: string }>('document-processing', {
      attempts: 2,
      concurrency: 1,
    });
    const inspector = driver.inspectChannel
      ? driver.inspectChannel<{ value: string }>('document-processing')
      : undefined;

    expect(inspector).toBeDefined();

    const firstJobId = await channel.enqueue('process', { value: 'first' }, { jobId: 'job-1' });
    const secondJobId = await channel.enqueue('process', { value: 'second' }, { jobId: 'job-1' });

    expect(firstJobId).toBe('job-1');
    expect(secondJobId).toBe('job-1');

    const snapshot = await inspector!.getJob('job-1');
    expect(snapshot).toMatchObject({
      id: 'job-1',
      name: 'process',
      data: { value: 'first' },
      attempt: 0,
      maxAttempts: 2,
    });
  });

  it('retries failed jobs and keeps attempt counts observable', async () => {
    const driver = createInlineQueueDriver();
    const channel = driver.createChannel<{ documentId: string }>('document-processing', {
      attempts: 3,
      concurrency: 1,
    });
    const inspector = driver.inspectChannel
      ? driver.inspectChannel<{ documentId: string }>('document-processing')
      : undefined;
    const onFailed = vi.fn();
    const processor = vi.fn(async (_job: { attempt: number; maxAttempts: number }) => undefined);
    processor.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(undefined);

    channel.startWorker(async (job) => {
      await processor({ attempt: job.attempt, maxAttempts: job.maxAttempts });
    }, {
      onFailed,
    });

    const jobId = await channel.enqueue(
      'process',
      { documentId: 'doc-1' },
      { jobId: 'job-retry-1' }
    );

    await waitFor(() => processor.mock.calls.length === 2);

    expect(jobId).toBe('job-retry-1');
    expect(processor).toHaveBeenNthCalledWith(1, { attempt: 1, maxAttempts: 3 });
    expect(processor).toHaveBeenNthCalledWith(2, { attempt: 2, maxAttempts: 3 });
    expect(onFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-retry-1', attempt: 1, maxAttempts: 3 }),
      expect.any(Error),
      true
    );

    const snapshot = await inspector!.getJob('job-retry-1');
    expect(snapshot).toMatchObject({
      id: 'job-retry-1',
      attempt: 2,
      maxAttempts: 3,
    });
  });
});
