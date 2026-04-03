import { Queue, Worker, type Job } from 'bullmq';
import { getQueueConnection, getQueuePrefix } from '@core/queue';
import { queueConfig } from '@config/env';
import {
  emitDocumentProcessingSettled,
  emitDocumentProcessingStarted,
} from '@core/document-processing';
import { processingService } from '../services/processing.service';
import { createLogger } from '@core/logger';
import type {
  DocumentProcessingEnqueueOptions,
  DocumentProcessingJobData,
} from './document-processing.types';

const logger = createLogger('document-processing.queue');

const QUEUE_NAME = 'document-processing';

// ==================== Queue ====================

const connectionOpts = getQueueConnection();
const prefix = getQueuePrefix();

let documentProcessingQueue: Queue<DocumentProcessingJobData> | null = null;

function createDocumentProcessingQueue(): Queue<DocumentProcessingJobData> {
  return new Queue<DocumentProcessingJobData>(QUEUE_NAME, {
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
}

export function getDocumentProcessingQueue(): Queue<DocumentProcessingJobData> {
  if (!documentProcessingQueue) {
    documentProcessingQueue = createDocumentProcessingQueue();
  }

  return documentProcessingQueue;
}

async function closeDocumentProcessingQueue(): Promise<void> {
  if (!documentProcessingQueue) {
    return;
  }

  try {
    await documentProcessingQueue.close();
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Connection is closed.') {
      throw error;
    }
  } finally {
    documentProcessingQueue = null;
  }
}

// ==================== Enqueue Helper ====================

/**
 * Enqueue a document for processing.
 *
 * Uses documentId + targetDocumentVersion (and optional targetIndexVersion/backfillRunId)
 * as the job ID so different document versions can queue independently while
 * duplicate retries for the same target are still deduplicated. Backfill runs
 * include runId to avoid being deduped by prior upload/edit jobs.
 */
export async function enqueueDocumentProcessing(
  documentId: string,
  userId: string,
  options: DocumentProcessingEnqueueOptions
): Promise<string> {
  const { targetDocumentVersion, targetIndexVersion, reason, backfillRunId, jobIdSuffix } = options;
  const jobData: DocumentProcessingJobData = {
    documentId,
    userId,
    targetDocumentVersion,
    targetIndexVersion,
    reason,
    backfillRunId,
    jobIdSuffix,
  };
  const baseJobId = targetIndexVersion
    ? `doc-${documentId}-v${targetDocumentVersion}-idx-${targetIndexVersion}`
    : `doc-${documentId}-v${targetDocumentVersion}`;
  const jobIdSegments = [
    baseJobId,
    backfillRunId ? `bf-${backfillRunId}` : undefined,
    jobIdSuffix,
  ].filter((segment): segment is string => Boolean(segment));
  const jobId = jobIdSegments.join('-');

  await getDocumentProcessingQueue().add('process', jobData, { jobId });
  logger.info(
    {
      documentId,
      userId,
      targetDocumentVersion,
      targetIndexVersion,
      reason,
      backfillRunId,
      jobIdSuffix,
      jobId,
    },
    'Document processing job enqueued'
  );
  return jobId;
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
      const {
        documentId,
        userId,
        targetDocumentVersion,
        targetIndexVersion,
        reason,
        backfillRunId,
      } = job.data;
      const attempt = job.attemptsMade + 1;
      const jobId = job.id?.toString();

      logger.info(
        {
          documentId,
          userId,
          targetDocumentVersion,
          targetIndexVersion,
          reason,
          backfillRunId,
          jobId,
          attempt,
        },
        'Processing document job'
      );

      try {
        await emitDocumentProcessingStarted({
          documentId,
          userId,
          targetDocumentVersion,
          targetIndexVersion,
          reason,
          backfillRunId,
          jobId,
          attempt,
        });
      } catch (error) {
        logger.warn(
          { documentId, backfillRunId, jobId, error },
          'Failed to emit document processing started lifecycle event'
        );
      }

      const result = await processingService.processDocument(documentId, userId, {
        targetDocumentVersion,
        targetIndexVersion,
        reason,
        backfillRunId,
      });

      try {
        await emitDocumentProcessingSettled({
          documentId,
          userId,
          targetDocumentVersion,
          targetIndexVersion,
          reason,
          backfillRunId,
          jobId,
          attempt,
          outcome: result.outcome,
          error: result.reason,
        });
      } catch (error) {
        logger.warn(
          { documentId, backfillRunId, jobId, error },
          'Failed to emit document processing settled lifecycle event'
        );
      }

      logger.info(
        {
          documentId,
          userId,
          targetDocumentVersion,
          targetIndexVersion,
          reason,
          backfillRunId,
          jobId,
          outcome: result.outcome,
        },
        'Document processing job completed'
      );
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
        targetDocumentVersion: job?.data.targetDocumentVersion,
        targetIndexVersion: job?.data.targetIndexVersion,
        reason: job?.data.reason,
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
  await closeDocumentProcessingQueue();
}
