export type QueueDriverName = 'bullmq' | 'inline';

export interface QueueBackoffOptions {
  type: 'fixed' | 'exponential';
  delay: number;
}

export interface QueueChannelOptions {
  attempts?: number;
  backoff?: QueueBackoffOptions;
  concurrency?: number;
  removeOnCompleteCount?: number;
  removeOnFailCount?: number;
}

export interface QueueEnqueueOptions {
  jobId?: string;
}

export interface QueuedJob<Data> {
  id?: string;
  name: string;
  data: Data;
  attempt: number;
  maxAttempts: number;
}

export type QueueJobSnapshot<Data> = QueuedJob<Data>;

export type QueueProcessor<Data> = (job: QueuedJob<Data>) => Promise<void>;

export interface QueueWorkerHooks<Data> {
  onFailed?(
    job: QueueJobSnapshot<Data> | undefined,
    error: unknown,
    retryable: boolean
  ): Promise<void> | void;
  onError?(error: unknown): Promise<void> | void;
}

export interface QueueWorkerHandle {
  waitUntilReady(): Promise<void>;
  close(): Promise<void>;
}

export interface QueueChannel<Data> {
  enqueue(name: string, data: Data, options?: QueueEnqueueOptions): Promise<string>;
  startWorker(processor: QueueProcessor<Data>, hooks?: QueueWorkerHooks<Data>): QueueWorkerHandle;
  close(): Promise<void>;
}

export interface QueueChannelInspector<Data> {
  getJob(jobId: string): Promise<QueueJobSnapshot<Data> | null>;
  clear(): Promise<void>;
}

export interface QueueDriver {
  createChannel<Data>(queueName: string, options: QueueChannelOptions): QueueChannel<Data>;
  inspectChannel?<Data>(queueName: string): QueueChannelInspector<Data>;
}
