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

interface InlineStoredJob<Data> {
  id: string;
  name: string;
  data: Data;
  attemptsMade: number;
  maxAttempts: number;
}

interface InlineWorkerState<Data> {
  concurrency: number;
  processor: QueueProcessor<Data>;
  hooks?: QueueWorkerHooks<Data>;
  activeCount: number;
  closed: boolean;
  handle: QueueWorkerHandle;
}

interface InlineQueueState<Data> {
  nextJobId: number;
  jobs: Map<string, InlineStoredJob<Data>>;
  pendingJobIds: string[];
  worker: InlineWorkerState<Data> | null;
}

function createInitialState<Data>(): InlineQueueState<Data> {
  return {
    nextJobId: 0,
    jobs: new Map(),
    pendingJobIds: [],
    worker: null,
  };
}

function toSnapshot<Data>(job: InlineStoredJob<Data>): QueueJobSnapshot<Data> {
  return {
    id: job.id,
    name: job.name,
    data: job.data,
    attempt: job.attemptsMade,
    maxAttempts: job.maxAttempts,
  };
}

class InlineQueueInspector<Data> implements QueueChannelInspector<Data> {
  constructor(private readonly state: InlineQueueState<Data>) {}

  async getJob(jobId: string): Promise<QueueJobSnapshot<Data> | null> {
    const job = this.state.jobs.get(jobId);
    return job ? toSnapshot(job) : null;
  }

  async clear(): Promise<void> {
    this.state.jobs.clear();
    this.state.pendingJobIds.length = 0;
    this.state.worker = null;
  }
}

class InlineQueueChannel<Data> implements QueueChannel<Data> {
  constructor(
    private readonly queueName: string,
    private readonly state: InlineQueueState<Data>,
    private readonly options: QueueChannelOptions
  ) {}

  async enqueue(name: string, data: Data, options?: { jobId?: string }): Promise<string> {
    const jobId = options?.jobId ?? `${this.queueName}-${++this.state.nextJobId}`;
    if (this.state.jobs.has(jobId)) {
      return jobId;
    }

    this.state.jobs.set(jobId, {
      id: jobId,
      name,
      data,
      attemptsMade: 0,
      maxAttempts: this.options.attempts ?? 1,
    });
    this.state.pendingJobIds.push(jobId);
    queueMicrotask(() => {
      void this.pump();
    });
    return jobId;
  }

  startWorker(processor: QueueProcessor<Data>, hooks?: QueueWorkerHooks<Data>): QueueWorkerHandle {
    if (this.state.worker && !this.state.worker.closed) {
      return this.state.worker.handle;
    }

    const workerState: InlineWorkerState<Data> = {
      concurrency: this.options.concurrency ?? 1,
      processor,
      hooks,
      activeCount: 0,
      closed: false,
      handle: {
        waitUntilReady: async () => undefined,
        close: async () => {
          workerState.closed = true;
          if (this.state.worker === workerState) {
            this.state.worker = null;
          }
        },
      },
    };

    this.state.worker = workerState;
    queueMicrotask(() => {
      void this.pump();
    });
    return workerState.handle;
  }

  private async pump(): Promise<void> {
    const worker = this.state.worker;
    if (!worker || worker.closed) {
      return;
    }

    while (
      !worker.closed &&
      worker.activeCount < worker.concurrency &&
      this.state.pendingJobIds.length > 0
    ) {
      const jobId = this.state.pendingJobIds.shift();
      if (!jobId) {
        return;
      }

      const storedJob = this.state.jobs.get(jobId);
      if (!storedJob) {
        continue;
      }

      worker.activeCount += 1;
      void this.processJob(worker, storedJob).finally(() => {
        worker.activeCount -= 1;
        queueMicrotask(() => {
          void this.pump();
        });
      });
    }
  }

  private async processJob(
    worker: InlineWorkerState<Data>,
    storedJob: InlineStoredJob<Data>
  ): Promise<void> {
    storedJob.attemptsMade += 1;

    try {
      await worker.processor(toSnapshot(storedJob));
    } catch (error) {
      const retryable = storedJob.attemptsMade < storedJob.maxAttempts;
      if (worker.hooks?.onFailed) {
        try {
          await worker.hooks.onFailed(toSnapshot(storedJob), error, retryable);
        } catch {
          // Ignore listener failures to match the production worker behavior.
        }
      }

      if (retryable && !worker.closed) {
        this.state.pendingJobIds.push(storedJob.id);
      }
    }
  }

  async close(): Promise<void> {
    this.state.jobs.clear();
    this.state.pendingJobIds.length = 0;
    this.state.worker = null;
  }
}

export function createInlineQueueDriver(): QueueDriver {
  const states = new Map<string, InlineQueueState<unknown>>();

  function getState<Data>(queueName: string): InlineQueueState<Data> {
    if (!states.has(queueName)) {
      states.set(queueName, createInitialState<unknown>());
    }

    return states.get(queueName) as InlineQueueState<Data>;
  }

  return {
    createChannel<Data>(queueName: string, options: QueueChannelOptions): QueueChannel<Data> {
      return new InlineQueueChannel(queueName, getState(queueName), options);
    },
    inspectChannel<Data>(queueName: string): QueueChannelInspector<Data> {
      return new InlineQueueInspector(getState(queueName));
    },
  };
}
