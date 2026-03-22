import { createLogger } from '@core/logger';
import { acquireProcessingLock, releaseProcessingLock } from './processing.lock';
import {
  createProcessingContext,
  prepareProcessingInputs,
  processPreparedDocument,
} from './processing.executor.helpers';
import {
  cleanupAfterProcessingFailure,
  recordProcessingFailureMetrics,
} from './processing.executor.failure';
import type { DocumentProcessingResult } from './processing.types';
import type { DocumentProcessingEnqueueOptions } from '../queue/document-processing.types';

const logger = createLogger('processing.service');

export async function processDocument(
  documentId: string,
  userId: string,
  request?: DocumentProcessingEnqueueOptions
): Promise<DocumentProcessingResult> {
  const context = createProcessingContext(documentId, userId, request);

  logger.info(
    {
      documentId,
      userId,
      targetDocumentVersion: request?.targetDocumentVersion,
      targetIndexVersion: request?.targetIndexVersion,
      reason: request?.reason,
    },
    'Starting document processing'
  );

  const lockAcquired = await acquireProcessingLock(documentId);
  if (!lockAcquired) {
    logger.info({ documentId }, 'Skipping - document already being processed');
    return { outcome: 'skipped', reason: 'lock_not_acquired' };
  }

  try {
    const preparation = await prepareProcessingInputs(context);
    if (preparation.kind === 'result') {
      return preparation.result;
    }

    return await processPreparedDocument(context, preparation.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ documentId, error: message }, 'Document processing failed');

    await cleanupAfterProcessingFailure(documentId, context, message);
    recordProcessingFailureMetrics(context, message);

    return { outcome: 'failed', reason: message };
  } finally {
    releaseProcessingLock(documentId);
  }
}
