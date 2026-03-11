import { Queue, Worker, type Job } from 'bullmq';
import { getQueueConnection, getQueuePrefix } from '@shared/queue';
import { queueConfig } from '@config/env';
import { processingService } from '../services/processing.service';
import { createLogger } from '@shared/logger';
import type {
  DocumentProcessingEnqueueOptions,
  DocumentProcessingJobData,
} from './document-processing.types';
import { documentIndexBackfillProgressService } from '@modules/document-index/services/document-index-backfill-progress.service';

const logger = createLogger('document-processing.queue');

const QUEUE_NAME = 'document-processing';

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
  const { targetDocumentVersion, targetIndexVersion, reason, backfillRunId } = options;
  const jobData: DocumentProcessingJobData = {
    documentId,
    userId,
    targetDocumentVersion,
    targetIndexVersion,
    reason,
    backfillRunId,
  };
  const baseJobId = targetIndexVersion
    ? `doc-${documentId}-v${targetDocumentVersion}-idx-${targetIndexVersion}`
    : `doc-${documentId}-v${targetDocumentVersion}`;
  const jobId = backfillRunId ? `${baseJobId}-bf-${backfillRunId}` : baseJobId;

  await documentProcessingQueue.add('process', jobData, { jobId });
  logger.info(
    { documentId, userId, targetDocumentVersion, targetIndexVersion, reason, jobId },
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

      logger.info(
        {
          documentId,
          userId,
          targetDocumentVersion,
          targetIndexVersion,
          reason,
          backfillRunId,
          jobId: job.id,
          attempt,
        },
        'Processing document job'
      );

      if (backfillRunId) {
        try {
          await documentIndexBackfillProgressService.markProcessing({
            runId: backfillRunId,
            documentId,
            jobId: job.id?.toString(),
          });
        } catch (error) {
          logger.warn(
            { documentId, backfillRunId, jobId: job.id, error },
            'Failed to mark backfill item as processing'
          );
        }
      }

      const result = await processingService.processDocument(documentId, userId, {
        targetDocumentVersion,
        targetIndexVersion,
        reason,
        backfillRunId,
      });

      if (backfillRunId) {
        try {
          await documentIndexBackfillProgressService.recordOutcome({
            runId: backfillRunId,
            documentId,
            outcome: result.outcome === 'failed' ? 'failed' : result.outcome,
            error: result.reason,
          });
        } catch (error) {
          logger.warn(
            { documentId, backfillRunId, jobId: job.id, error },
            'Failed to record backfill item outcome'
          );
        }
      }

      logger.info(
        {
          documentId,
          userId,
          targetDocumentVersion,
          targetIndexVersion,
          reason,
          backfillRunId,
          jobId: job.id,
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
  await documentProcessingQueue.close();
}
