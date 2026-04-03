import { beforeEach, describe, expect, it, vi } from 'vitest';

// ==================== Mocks ====================

const { queueAddMock, processingServiceMock, lifecycleMock, workerState } = vi.hoisted(() => ({
  queueAddMock: vi.fn(async (_name: string, _data: unknown, options?: { jobId?: string }) => ({
    id: options?.jobId ?? 'job-1',
  })),
  processingServiceMock: {
    processDocument: vi.fn(async () => ({ outcome: 'completed' })),
  },
  lifecycleMock: {
    emitDocumentProcessingStarted: vi.fn(),
    emitDocumentProcessingSettled: vi.fn(),
  },
  workerState: {
    processor: undefined as
      | ((job: {
          id?: string;
          name: string;
          data: Record<string, unknown>;
          attemptsMade: number;
          opts?: { attempts?: number };
        }) => Promise<void>)
      | undefined,
    events: [] as string[],
  },
}));

const {
  queueCloseMock,
  workerCloseMock,
  workerWaitUntilReadyMock,
} = vi.hoisted(() => ({
  queueCloseMock: vi.fn(async () => undefined),
  workerCloseMock: vi.fn(async () => undefined),
  workerWaitUntilReadyMock: vi.fn(async () => undefined),
}));

vi.mock('@core/config/env', () => ({
  queueConfig: {
    driver: 'bullmq' as const,
    concurrency: 2,
    maxRetries: 3,
    backoffDelay: 5000,
    backoffType: 'exponential' as const,
  },
  redisConfig: {
    url: 'redis://localhost:6379',
    prefix: 'test',
  },
  databaseConfig: {
    url: 'mysql://user:pass@localhost:3306/test',
    connectionLimit: 1,
    queueLimit: 0,
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('bullmq', () => {
  function QueueMock() {
    return {
      add: queueAddMock,
      close: queueCloseMock,
      getJob: vi.fn(async () => null),
      obliterate: vi.fn(async () => undefined),
    };
  }

  function WorkerMock(_name: string, processor: typeof workerState.processor) {
    workerState.processor = processor;
    workerState.events = [];
    return {
      close: workerCloseMock,
      waitUntilReady: workerWaitUntilReadyMock,
      on: vi.fn((eventName: string) => {
        workerState.events.push(eventName);
      }),
    };
  }

  return { Queue: QueueMock, Worker: WorkerMock };
});

vi.mock('@modules/rag/services/processing.service', () => ({
  processingService: processingServiceMock,
}));

vi.mock('@core/document-processing', async () => {
  const actual = await vi.importActual<typeof import('@core/document-processing')>(
    '@core/document-processing'
  );
  return {
    ...actual,
    emitDocumentProcessingStarted: lifecycleMock.emitDocumentProcessingStarted,
    emitDocumentProcessingSettled: lifecycleMock.emitDocumentProcessingSettled,
  };
});

import {
  enqueueDocumentProcessing,
  startDocumentProcessingWorker,
  stopDocumentProcessingWorker,
} from '@modules/rag/queue/document-processing.queue';

// ==================== Tests ====================

describe('document-processing.queue', () => {
  beforeEach(async () => {
    await stopDocumentProcessingWorker();
    vi.clearAllMocks();
    workerState.processor = undefined;
    workerState.events = [];
  });

  describe('enqueueDocumentProcessing', () => {
    it('should add a job to the queue with correct data', async () => {
      await enqueueDocumentProcessing('doc-1', 'user-1', {
        targetDocumentVersion: 3,
        reason: 'edit',
      });

      expect(queueAddMock).toHaveBeenCalledWith(
        'process',
        {
          documentId: 'doc-1',
          userId: 'user-1',
          targetDocumentVersion: 3,
          targetIndexVersion: undefined,
          reason: 'edit',
          backfillRunId: undefined,
          jobIdSuffix: undefined,
        },
        { jobId: 'doc-doc-1-v3' }
      );
    });

    it('should use version-aware jobId for deduplication', async () => {
      await enqueueDocumentProcessing('doc-abc', 'user-2', {
        targetDocumentVersion: 7,
        targetIndexVersion: 'idx-2',
        reason: 'backfill',
      });

      const callArgs = queueAddMock.mock.calls.at(0);
      expect(callArgs).toBeDefined();
      const jobOptions = (callArgs as unknown[] | undefined)?.[2] as { jobId: string } | undefined;
      expect(jobOptions).toEqual({ jobId: 'doc-doc-abc-v7-idx-idx-2' });
    });

    it('should include backfillRunId in jobId when provided', async () => {
      await enqueueDocumentProcessing('doc-xyz', 'user-3', {
        targetDocumentVersion: 1,
        reason: 'backfill',
        backfillRunId: 'run-123',
      });

      const callArgs = queueAddMock.mock.calls.at(0);
      const jobOptions = (callArgs as unknown[] | undefined)?.[2] as { jobId: string } | undefined;
      expect(jobOptions).toEqual({ jobId: 'doc-doc-xyz-v1-bf-run-123' });
    });

    it('should append jobIdSuffix for recovery jobs', async () => {
      await enqueueDocumentProcessing('doc-recovery', 'user-4', {
        targetDocumentVersion: 9,
        reason: 'recovery',
        jobIdSuffix: 'recovery-g12',
      });

      const callArgs = queueAddMock.mock.calls.at(0);
      const jobData = (callArgs as unknown[] | undefined)?.[1] as
        | {
            documentId: string;
            userId: string;
            targetDocumentVersion: number;
            reason: string;
            jobIdSuffix?: string;
          }
        | undefined;
      expect(jobData).toMatchObject({
        documentId: 'doc-recovery',
        userId: 'user-4',
        targetDocumentVersion: 9,
        reason: 'recovery',
        jobIdSuffix: 'recovery-g12',
      });
      const jobOptions = (callArgs as unknown[] | undefined)?.[2] as { jobId: string } | undefined;
      expect(jobOptions).toEqual({ jobId: 'doc-doc-recovery-v9-recovery-g12' });
    });
  });

  describe('startDocumentProcessingWorker', () => {
    it('should create a worker with failure and error hooks', () => {
      const worker = startDocumentProcessingWorker();

      expect(worker).toBeDefined();
      expect(worker.waitUntilReady).toBeTypeOf('function');
      expect(workerState.events).toContain('failed');
      expect(workerState.events).toContain('error');
    });

    it('should emit lifecycle events around processing results', async () => {
      startDocumentProcessingWorker();

      expect(workerState.processor).toBeTypeOf('function');

      await workerState.processor?.({
        id: 'job-1',
        name: 'process',
        data: {
          documentId: 'doc-1',
          userId: 'user-1',
          targetDocumentVersion: 3,
          targetIndexVersion: 'idx-1',
          reason: 'backfill',
          backfillRunId: 'run-1',
        },
        attemptsMade: 0,
        opts: { attempts: 4 },
      });

      expect(lifecycleMock.emitDocumentProcessingStarted).toHaveBeenCalledWith({
        documentId: 'doc-1',
        userId: 'user-1',
        targetDocumentVersion: 3,
        targetIndexVersion: 'idx-1',
        reason: 'backfill',
        backfillRunId: 'run-1',
        jobId: 'job-1',
        attempt: 1,
      });
      expect(processingServiceMock.processDocument).toHaveBeenCalledWith('doc-1', 'user-1', {
        targetDocumentVersion: 3,
        targetIndexVersion: 'idx-1',
        reason: 'backfill',
        backfillRunId: 'run-1',
      });
      expect(lifecycleMock.emitDocumentProcessingSettled).toHaveBeenCalledWith({
        documentId: 'doc-1',
        userId: 'user-1',
        targetDocumentVersion: 3,
        targetIndexVersion: 'idx-1',
        reason: 'backfill',
        backfillRunId: 'run-1',
        jobId: 'job-1',
        attempt: 1,
        outcome: 'completed',
        error: undefined,
      });
    });

    it('should continue processing when lifecycle emission fails', async () => {
      lifecycleMock.emitDocumentProcessingStarted.mockRejectedValueOnce(
        new Error('listener failed')
      );
      processingServiceMock.processDocument.mockResolvedValueOnce({
        outcome: 'skipped',
        reason: 'stale_target_version',
      });

      startDocumentProcessingWorker();

      await expect(
        workerState.processor?.({
          id: 'job-2',
          name: 'process',
          data: {
            documentId: 'doc-2',
            userId: 'user-2',
            targetDocumentVersion: 4,
            reason: 'backfill',
            backfillRunId: 'run-2',
          },
          attemptsMade: 1,
          opts: { attempts: 4 },
        })
      ).resolves.toBeUndefined();

      expect(processingServiceMock.processDocument).toHaveBeenCalledWith('doc-2', 'user-2', {
        targetDocumentVersion: 4,
        targetIndexVersion: undefined,
        reason: 'backfill',
        backfillRunId: 'run-2',
      });
      expect(lifecycleMock.emitDocumentProcessingSettled).toHaveBeenCalledWith({
        documentId: 'doc-2',
        userId: 'user-2',
        targetDocumentVersion: 4,
        targetIndexVersion: undefined,
        reason: 'backfill',
        backfillRunId: 'run-2',
        jobId: 'job-2',
        attempt: 2,
        outcome: 'skipped',
        error: 'stale_target_version',
      });
    });
  });

  describe('stopDocumentProcessingWorker', () => {
    it('should close worker without error', async () => {
      startDocumentProcessingWorker();
      await expect(stopDocumentProcessingWorker()).resolves.not.toThrow();
      expect(workerCloseMock).toHaveBeenCalled();
    });

    it('should no-op when neither worker nor queue was created', async () => {
      await expect(stopDocumentProcessingWorker()).resolves.not.toThrow();
    });

    it('should close queue if it was created without starting worker', async () => {
      await enqueueDocumentProcessing('doc-queue', 'user-1', {
        targetDocumentVersion: 1,
        reason: 'upload',
      });

      await expect(stopDocumentProcessingWorker()).resolves.not.toThrow();
      expect(queueCloseMock).toHaveBeenCalled();
    });
  });
});
