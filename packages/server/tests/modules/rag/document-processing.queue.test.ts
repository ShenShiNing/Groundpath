import { beforeEach, describe, expect, it, vi } from 'vitest';

// ==================== Mocks ====================

const { queueAddMock, processingServiceMock } = vi.hoisted(() => ({
  queueAddMock: vi.fn(async () => ({ id: 'job-1' })),
  processingServiceMock: {
    processDocument: vi.fn(async () => ({ outcome: 'completed' })),
  },
}));

vi.mock('@core/config/env', () => ({
  queueConfig: {
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
      close: vi.fn(async () => undefined),
    };
  }

  function WorkerMock(_name: string, _processor: unknown) {
    return {
      close: vi.fn(async () => undefined),
      on: vi.fn(),
    };
  }

  return { Queue: QueueMock, Worker: WorkerMock };
});

vi.mock('@modules/rag/services/processing.service', () => ({
  processingService: processingServiceMock,
}));

import {
  enqueueDocumentProcessing,
  startDocumentProcessingWorker,
  stopDocumentProcessingWorker,
  documentProcessingQueue,
} from '@modules/rag/queue/document-processing.queue';

// ==================== Tests ====================

describe('document-processing.queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    it('should create a worker with event handlers', () => {
      const worker = startDocumentProcessingWorker();

      expect(worker).toBeDefined();

      // Worker's on() should have been called for 'failed' and 'error'
      const onMock = worker.on as ReturnType<typeof vi.fn>;
      const eventNames = onMock.mock.calls.map((c: unknown[]) => c[0]);
      expect(eventNames).toContain('failed');
      expect(eventNames).toContain('error');
    });
  });

  describe('stopDocumentProcessingWorker', () => {
    it('should close worker and queue without error', async () => {
      startDocumentProcessingWorker();
      await expect(stopDocumentProcessingWorker()).resolves.not.toThrow();
    });

    it('should close queue even if no worker was started', async () => {
      await expect(stopDocumentProcessingWorker()).resolves.not.toThrow();
      expect(documentProcessingQueue.close).toHaveBeenCalled();
    });
  });
});
