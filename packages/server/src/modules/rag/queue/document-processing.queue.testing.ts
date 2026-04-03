import type { QueueChannelInspector } from '@core/queue';
import { getQueueDriver } from '@core/queue';
import type { DocumentProcessingJobData } from './document-processing.types';
import { DOCUMENT_PROCESSING_QUEUE_NAME } from './document-processing.types';

export function getDocumentProcessingQueueInspector(): QueueChannelInspector<DocumentProcessingJobData> {
  const inspectChannel = getQueueDriver().inspectChannel;
  const inspector = inspectChannel
    ? inspectChannel<DocumentProcessingJobData>(DOCUMENT_PROCESSING_QUEUE_NAME)
    : undefined;

  if (!inspector) {
    throw new Error('The active queue driver does not support queue inspection.');
  }

  return inspector;
}
