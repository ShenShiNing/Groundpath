export const DOCUMENT_PROCESSING_REASONS = [
  'upload',
  'edit',
  'restore',
  'retry',
  'backfill',
] as const;

export type DocumentProcessingReason = (typeof DOCUMENT_PROCESSING_REASONS)[number];

export interface DocumentProcessingEnqueueOptions {
  targetDocumentVersion: number;
  targetIndexVersion?: string;
  reason: DocumentProcessingReason;
  backfillRunId?: string;
}

export interface DocumentProcessingJobData extends DocumentProcessingEnqueueOptions {
  documentId: string;
  userId: string;
}
