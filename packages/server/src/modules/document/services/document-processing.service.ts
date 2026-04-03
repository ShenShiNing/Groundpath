import type { Transaction } from '@core/db/db.utils';
import { documentRepository } from '../repositories/document.repository';

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

export const documentProcessingService = {
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
