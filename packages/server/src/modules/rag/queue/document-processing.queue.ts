import { Queue, Worker, type Job } from 'bullmq';
import { getQueueConnection, getQueuePrefix } from '@shared/queue';
import { queueConfig } from '@config/env';
import { processingService } from '../services/processing.service';
import { createLogger } from '@shared/logger';

const logger = createLogger('document-processing.queue');

const QUEUE_NAME = 'document-processing';

export interface DocumentProcessingJobData {
  documentId: string;
  userId: string;
}

// ==================== Queue ====================

const connectionOpts = getQueueConnection();
const prefix = getQueuePrefix();

export const documentProcessingQueue = new Queue<DocumentProcessingJobData>(QUEUE_NAME, {
  connection: connectionOpts,
  prefix,
  defaultJobOptions: {
    attempts: queueConfig.maxRetries + 1,
    backoff: {
      type: queueConfig.backoffType,
      delay: queueConfig.backoffDelay,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// ==================== Enqueue Helper ====================

/**
 * Enqueue a document for processing.
 *
 * Uses the documentId as the job ID for natural deduplication:
 * - If the same document is already queued/active, the duplicate is ignored.
 * - If a previous job completed/failed (and was cleaned up), a new job is created.
 */
export async function enqueueDocumentProcessing(documentId: string, userId: string): Promise<void> {
  await documentProcessingQueue.add(
    'process',
    { documentId, userId },
    {
      jobId: `doc-${documentId}`,
    }
  );
  logger.info({ documentId, userId }, 'Document processing job enqueued');
}

// ==================== Worker ====================

let worker: Worker<DocumentProcessingJobData> | null = null;

/**
 * Start the document processing worker.
 *
 * The worker consumes jobs from the queue and delegates to processingService.
 * It runs in the same process by default but could be extracted to a
 * standalone process for horizontal scaling.
 */
export function startDocumentProcessingWorker(): Worker<DocumentProcessingJobData> {
  if (worker) return worker;

  worker = new Worker<DocumentProcessingJobData>(
    QUEUE_NAME,
    async (job: Job<DocumentProcessingJobData>) => {
      const { documentId, userId } = job.data;
      const attempt = job.attemptsMade + 1;

      logger.info({ documentId, userId, jobId: job.id, attempt }, 'Processing document job');

      await processingService.processDocument(documentId, userId);

      logger.info({ documentId, userId, jobId: job.id }, 'Document processing job completed');
    },
    {
      connection: connectionOpts,
      prefix,
      concurrency: queueConfig.concurrency,
    }
  );

  worker.on('failed', (job, err) => {
    const isRetryable = job && job.attemptsMade < (job.opts?.attempts ?? 1);
    logger.error(
      {
        documentId: job?.data.documentId,
        jobId: job?.id,
        err,
        attemptsMade: job?.attemptsMade,
        retryable: isRetryable,
      },
      isRetryable
        ? 'Document processing job failed, will retry'
        : 'Document processing job failed permanently (dead letter)'
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Document processing worker error');
  });

  logger.info(
    { concurrency: queueConfig.concurrency, maxRetries: queueConfig.maxRetries },
    'Document processing worker started'
  );
  return worker;
}

/**
 * Gracefully stop the worker and close the queue connection.
 */
export async function stopDocumentProcessingWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Document processing worker stopped');
  }
  await documentProcessingQueue.close();
}
