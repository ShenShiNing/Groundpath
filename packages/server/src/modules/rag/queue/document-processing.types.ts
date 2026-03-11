export const DOCUMENT_PROCESSING_REASONS = [
  'upload',
  'edit',
  'restore',
  'retry',
  'backfill',
  'recovery',
] as const;

export type DocumentProcessingReason = (typeof DOCUMENT_PROCESSING_REASONS)[number];

export interface DocumentProcessingEnqueueOptions {
  targetDocumentVersion: number;
  targetIndexVersion?: string;
  reason: DocumentProcessingReason;
  backfillRunId?: string;
  jobIdSuffix?: string;
}

export interface DocumentProcessingJobData extends DocumentProcessingEnqueueOptions {
  documentId: string;
  userId: string;
}
