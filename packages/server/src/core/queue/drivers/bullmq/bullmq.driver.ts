import { Queue, Worker, type Job } from 'bullmq';
import type {
  QueueChannel,
  QueueChannelInspector,
  QueueChannelOptions,
  QueueDriver,
  QueueJobSnapshot,
  QueueProcessor,
  QueueWorkerHandle,
  QueueWorkerHooks,
} from '../../types';
import { buildBullmqPrefix, createBullmqConnection } from './bullmq.connection';

interface BullmqQueueDriverOptions {
  redisUrl: string;
  redisPrefix: string;
}

type BullmqQueueInstance<Data> = Queue<Data, void, string>;
type BullmqAddName<Data> = Parameters<BullmqQueueInstance<Data>['add']>[0];
type BullmqAddData<Data> = Parameters<BullmqQueueInstance<Data>['add']>[1];

function toRetentionConfig(count?: number): { count: number } | undefined {
  return count === undefined ? undefined : { count };
}

function mapBullmqJobSnapshot<Data>(job: Job<Data>): QueueJobSnapshot<Data> {
  return {
    id: job.id?.toString(),
    name: job.name,
    data: job.data,
    attempt: job.attemptsMade,
    maxAttempts: job.opts?.attempts ?? 1,
  };
}

function mapBullmqJobForProcessing<Data>(job: Job<Data>): QueueJobSnapshot<Data> {
  return {
    ...mapBullmqJobSnapshot(job),
    attempt: job.attemptsMade + 1,
  };
}

class BullmqQueueChannel<Data> implements QueueChannel<Data> {
  private readonly connection: ReturnType<typeof createBullmqConnection>;
  private readonly prefix: string;
  private queue: BullmqQueueInstance<Data> | null = null;

  constructor(
    private readonly queueName: string,
    private readonly options: BullmqQueueDriverOptions & QueueChannelOptions
  ) {
    this.connection = createBullmqConnection(this.options.redisUrl);
    this.prefix = buildBullmqPrefix(this.options.redisPrefix);
  }

  private getQueue(): BullmqQueueInstance<Data> {
    if (!this.queue) {
      this.queue = new Queue<Data, void, string>(this.queueName, {
        connection: this.connection,
        prefix: this.prefix,
        defaultJobOptions: {
          attempts: this.options.attempts,
          backoff: this.options.backoff,
          removeOnComplete: toRetentionConfig(this.options.removeOnCompleteCount),
          removeOnFail: toRetentionConfig(this.options.removeOnFailCount),
        },
      });
    }

    return this.queue;
  }

  async enqueue(name: string, data: Data, options?: { jobId?: string }): Promise<string> {
    const job = await this.getQueue().add(
      name as BullmqAddName<Data>,
      data as BullmqAddData<Data>,
      { jobId: options?.jobId }
    );
    const jobId = job.id?.toString() ?? options?.jobId;

    if (!jobId) {
      throw new Error(`BullMQ did not return a job id for queue "${this.queueName}"`);
    }

    return jobId;
  }

  startWorker(processor: QueueProcessor<Data>, hooks?: QueueWorkerHooks<Data>): QueueWorkerHandle {
    const worker = new Worker<Data>(
      this.queueName,
      async (job) => processor(mapBullmqJobForProcessing(job)),
      {
        connection: this.connection,
        prefix: this.prefix,
        concurrency: this.options.concurrency,
      }
    );
    const typedWorker = worker as Worker<Data, void, string>;
    typedWorker.on('failed', (job, error) => {
      if (!hooks?.onFailed) {
        return;
      }

      const mappedSnapshot = job ? mapBullmqJobSnapshot(job) : undefined;
      const retryable = job ? job.attemptsMade < (job.opts?.attempts ?? 1) : false;

      void Promise.resolve(hooks.onFailed(mappedSnapshot, error, retryable)).catch(() => undefined);
    });

    typedWorker.on('error', (error) => {
      if (!hooks?.onError) {
        return;
      }

      void Promise.resolve(hooks.onError(error)).catch(() => undefined);
    });

    return {
      waitUntilReady: async () => {
        await typedWorker.waitUntilReady();
      },
      close: async () => {
        await typedWorker.close();
      },
    };
  }

  async close(): Promise<void> {
    if (!this.queue) {
      return;
    }

    try {
      await this.queue.close();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Connection is closed.') {
        throw error;
      }
    } finally {
      this.queue = null;
    }
  }
}

class BullmqQueueInspector<Data> implements QueueChannelInspector<Data> {
  private readonly connection: ReturnType<typeof createBullmqConnection>;
  private readonly prefix: string;
  private queue: BullmqQueueInstance<Data> | null = null;

  constructor(
    private readonly queueName: string,
    private readonly options: BullmqQueueDriverOptions
  ) {
    this.connection = createBullmqConnection(this.options.redisUrl);
    this.prefix = buildBullmqPrefix(this.options.redisPrefix);
  }

  private getQueue(): BullmqQueueInstance<Data> {
    if (!this.queue) {
      this.queue = new Queue<Data, void, string>(this.queueName, {
        connection: this.connection,
        prefix: this.prefix,
      });
    }

    return this.queue;
  }

  async getJob(jobId: string): Promise<QueueJobSnapshot<Data> | null> {
    const job = await this.getQueue().getJob(jobId);
    return job ? mapBullmqJobSnapshot(job) : null;
  }

  async clear(): Promise<void> {
    try {
      await this.getQueue().obliterate({ force: true });
    } finally {
      await this.close();
    }
  }

  private async close(): Promise<void> {
    if (!this.queue) {
      return;
    }

    try {
      await this.queue.close();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Connection is closed.') {
        throw error;
      }
    } finally {
      this.queue = null;
    }
  }
}

export function createBullmqQueueDriver(options: BullmqQueueDriverOptions): QueueDriver {
  return {
    createChannel<Data>(
      queueName: string,
      channelOptions: QueueChannelOptions
    ): QueueChannel<Data> {
      return new BullmqQueueChannel(queueName, { ...options, ...channelOptions });
    },
    inspectChannel<Data>(queueName: string): QueueChannelInspector<Data> {
      return new BullmqQueueInspector(queueName, options);
    },
  };
}
