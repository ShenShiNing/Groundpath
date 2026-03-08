import { beforeEach, describe, expect, it, vi } from 'vitest';

// ==================== Mocks ====================

const { queueAddMock, processingServiceMock } = vi.hoisted(() => ({
  queueAddMock: vi.fn(async () => ({ id: 'job-1' })),
  processingServiceMock: {
    processDocument: vi.fn(async () => undefined),
  },
}));

vi.mock('@shared/config/env', () => ({
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
}));

vi.mock('@shared/logger', () => ({
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
      await enqueueDocumentProcessing('doc-1', 'user-1');

      expect(queueAddMock).toHaveBeenCalledWith(
        'process',
        { documentId: 'doc-1', userId: 'user-1' },
        { jobId: 'doc-doc-1' }
      );
    });

    it('should use documentId-based jobId for deduplication', async () => {
      await enqueueDocumentProcessing('doc-abc', 'user-2');

      const callArgs = queueAddMock.mock.calls[0];
      expect(callArgs![2]).toEqual({ jobId: 'doc-doc-abc' });
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
