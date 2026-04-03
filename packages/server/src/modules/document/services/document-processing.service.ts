import type { DocumentType } from '@groundpath/shared/types';
import type { Transaction } from '@core/db/db.utils';
import { documentRepository } from '../repositories/document.repository';
import { documentVersionRepository } from '../repositories/document-version.repository';

export interface DocumentProcessingSnapshot {
  id: string;
  userId: string;
  knowledgeBaseId: string;
  documentType: DocumentType;
  currentVersion: number;
  chunkCount: number;
  publishGeneration: number;
  updatedAt: Date;
  activeIndexVersionId: string | null;
}

export interface DocumentVersionContentSnapshot {
  documentId: string;
  version: number;
  textContent: string | null;
  fileName: string;
  documentType: DocumentType;
  storageKey: string;
}

export interface StaleProcessingCandidate {
  id: string;
  userId: string;
  knowledgeBaseId: string;
  title: string;
  currentVersion: number;
  publishGeneration: number;
  processingStartedAt: Date;
}

export interface MarkDocumentProcessingFailedInput {
  documentId: string;
  message: string;
  expectedPublishGeneration?: number;
  tx?: Transaction;
}

export interface RecoverStaleProcessingCandidateInput {
  documentId: string;
  staleBefore: Date;
}

export interface ListStaleProcessingCandidatesInput {
  staleBefore: Date;
  limit: number;
}

function toProcessingSnapshot(
  document: Awaited<ReturnType<typeof documentRepository.findById>>
): DocumentProcessingSnapshot | undefined {
  if (!document) {
    return undefined;
  }

  return {
    id: document.id,
    userId: document.userId,
    knowledgeBaseId: document.knowledgeBaseId,
    documentType: document.documentType,
    currentVersion: document.currentVersion,
    chunkCount: document.chunkCount,
    publishGeneration: document.publishGeneration,
    updatedAt: document.updatedAt,
    activeIndexVersionId: document.activeIndexVersionId,
  };
}

function toVersionContentSnapshot(
  version: Awaited<ReturnType<typeof documentVersionRepository.findByDocumentAndVersion>>
): DocumentVersionContentSnapshot | undefined {
  if (!version) {
    return undefined;
  }

  return {
    documentId: version.documentId,
    version: version.version,
    textContent: version.textContent,
    fileName: version.fileName,
    documentType: version.documentType,
    storageKey: version.storageKey,
  };
}

export const documentProcessingService = {
  async getProcessingSnapshot(
    documentId: string,
    tx?: Transaction
  ): Promise<DocumentProcessingSnapshot | undefined> {
    return toProcessingSnapshot(await documentRepository.findById(documentId, tx));
  },

  async getVersionContentSnapshot(
    documentId: string,
    version: number
  ): Promise<DocumentVersionContentSnapshot | undefined> {
    return toVersionContentSnapshot(
      await documentVersionRepository.findByDocumentAndVersion(documentId, version)
    );
  },

  async listStaleProcessingCandidates(
    input: ListStaleProcessingCandidatesInput
  ): Promise<StaleProcessingCandidate[]> {
    return documentRepository.listStaleProcessingDocuments(input.staleBefore, input.limit);
  },

  async getActiveIndexVersionMap(documentIds: string[]): Promise<Map<string, string | null>> {
    return documentRepository.getActiveIndexVersionMap(documentIds);
  },

  async markProcessingPending(documentId: string, tx?: Transaction): Promise<boolean> {
    return documentRepository.updateProcessingStatus(documentId, 'pending', null, undefined, tx);
  },

  async markProcessingFailed(input: MarkDocumentProcessingFailedInput): Promise<boolean> {
    if (input.expectedPublishGeneration === undefined) {
      return documentRepository.updateProcessingStatus(
        input.documentId,
        'failed',
        input.message,
        undefined,
        input.tx
      );
    }

    return documentRepository.updateProcessingStatusWithPublishGeneration(
      input.documentId,
      input.expectedPublishGeneration,
      'failed',
      input.message,
      undefined,
      input.tx
    );
  },

  async recoverStaleProcessingCandidate(
    input: RecoverStaleProcessingCandidateInput
  ): Promise<boolean> {
    return documentRepository.resetStaleProcessingDocument(input.documentId, input.staleBefore);
  },
};
