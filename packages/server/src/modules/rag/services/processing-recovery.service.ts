import { documentConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import { documentRepository } from '@modules/document';
import { processingService } from './processing.service';

const logger = createLogger('processing-recovery.service');

export interface ProcessingRecoveryResult {
  timeoutMinutes: number;
  staleBefore: string;
  scannedCount: number;
  recoveredCount: number;
  skippedCount: number;
  recoveredDocumentIds: string[];
  skippedDocumentIds: string[];
}

export const processingRecoveryService = {
  buildStaleBefore(now: Date = new Date()): Date {
    return new Date(now.getTime() - documentConfig.processingTimeoutMinutes * 60_000);
  },

  async recoverStaleProcessing(now: Date = new Date()): Promise<ProcessingRecoveryResult> {
    const staleBefore = this.buildStaleBefore(now);
    const staleDocuments = await documentRepository.listStaleProcessingDocuments(
      staleBefore,
      documentConfig.processingRecoveryBatchSize
    );

    const recoveredDocumentIds: string[] = [];
    const skippedDocumentIds: string[] = [];

    for (const document of staleDocuments) {
      try {
        const recovered = await documentRepository.resetStaleProcessingDocument(
          document.id,
          staleBefore
        );

        if (!recovered) {
          skippedDocumentIds.push(document.id);
          logger.info(
            {
              documentId: document.id,
              userId: document.userId,
              knowledgeBaseId: document.knowledgeBaseId,
              processingStartedAt: document.processingStartedAt,
            },
            'Skipping stale processing recovery because document state changed before reset'
          );
          continue;
        }

        processingService.releaseProcessingLock(document.id);
        recoveredDocumentIds.push(document.id);

        logger.warn(
          {
            documentId: document.id,
            userId: document.userId,
            knowledgeBaseId: document.knowledgeBaseId,
            title: document.title,
            processingStartedAt: document.processingStartedAt,
            staleBefore,
            timeoutMinutes: documentConfig.processingTimeoutMinutes,
          },
          'Recovered stale document processing status back to pending'
        );
      } catch (error) {
        skippedDocumentIds.push(document.id);
        logger.error(
          {
            documentId: document.id,
            userId: document.userId,
            knowledgeBaseId: document.knowledgeBaseId,
            error,
          },
          'Failed to recover stale document processing status'
        );
      }
    }

    return {
      timeoutMinutes: documentConfig.processingTimeoutMinutes,
      staleBefore: staleBefore.toISOString(),
      scannedCount: staleDocuments.length,
      recoveredCount: recoveredDocumentIds.length,
      skippedCount: skippedDocumentIds.length,
      recoveredDocumentIds,
      skippedDocumentIds,
    };
  },
};
