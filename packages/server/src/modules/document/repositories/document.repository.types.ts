import type { DocumentType } from '@knowledge-agent/shared/types';
import type { Document } from '@shared/db/schema/document/documents.schema';

export interface DocumentBackfillCandidate {
  id: string;
  userId: string;
  title: string;
  knowledgeBaseId: string;
  documentType: DocumentType;
  currentVersion: number;
  activeIndexVersionId: string | null;
  processingStatus: Document['processingStatus'];
  updatedAt: Date;
}

export interface StaleProcessingDocument {
  id: string;
  userId: string;
  knowledgeBaseId: string;
  title: string;
  processingStartedAt: Date;
}

export type DocumentUpdateInput = Partial<
  Pick<
    Document,
    | 'title'
    | 'description'
    | 'currentVersion'
    | 'fileName'
    | 'mimeType'
    | 'fileSize'
    | 'fileExtension'
    | 'documentType'
    | 'activeIndexVersionId'
    | 'processingStatus'
    | 'processingError'
    | 'processingStartedAt'
    | 'publishGeneration'
    | 'chunkCount'
    | 'updatedBy'
  >
>;
