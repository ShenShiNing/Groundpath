export { DOCUMENT_PROCESSING_REASONS } from '@core/document-processing';
export type {
  DocumentProcessingDispatchOptions as DocumentProcessingEnqueueOptions,
  DocumentProcessingReason,
} from '@core/document-processing';

import type { DocumentProcessingDispatchOptions } from '@core/document-processing';

export const DOCUMENT_PROCESSING_QUEUE_NAME = 'document-processing';

export interface DocumentProcessingJobData extends DocumentProcessingDispatchOptions {
  documentId: string;
  userId: string;
}
