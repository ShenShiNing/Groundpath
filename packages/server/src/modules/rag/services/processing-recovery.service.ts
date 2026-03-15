import { documentConfig } from '@config/env';
import { createLogger } from '@core/logger';
import { documentRepository } from '@modules/document/repositories';
import { enqueueDocumentProcessing } from '../queue/document-processing.queue';
import { processingService } from './processing.service';

const logger = createLogger('processing-recovery.service');

export interface ProcessingRecoveryResult {
  timeoutMinutes: number;
  staleBefore: string;
  requeueEnabled: boolean;
  scannedCount: number;
  recoveredCount: number;
  skippedCount: number;
  requeuedCount: number;
  requeueFailedCount: number;
  recoveredDocumentIds: string[];
  skippedDocumentIds: string[];
  requeuedDocumentIds: string[];
  requeueFailedDocumentIds: string[];
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
    const requeuedDocumentIds: string[] = [];
    const requeueFailedDocumentIds: string[] = [];

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

        if (documentConfig.processingRecoveryRequeueEnabled) {
          try {
            const jobId = await enqueueDocumentProcessing(document.id, document.userId, {
              targetDocumentVersion: document.currentVersion,
              reason: 'recovery',
              jobIdSuffix: `recovery-g${document.publishGeneration + 1}`,
            });

            requeuedDocumentIds.push(document.id);
            logger.info(
              {
                documentId: document.id,
                userId: document.userId,
                knowledgeBaseId: document.knowledgeBaseId,
                targetDocumentVersion: document.currentVersion,
                recoveryPublishGeneration: document.publishGeneration + 1,
                jobId,
              },
              'Re-enqueued recovered document for processing'
            );
          } catch (error) {
            requeueFailedDocumentIds.push(document.id);
            logger.error(
              {
                documentId: document.id,
                userId: document.userId,
                knowledgeBaseId: document.knowledgeBaseId,
                targetDocumentVersion: document.currentVersion,
                recoveryPublishGeneration: document.publishGeneration + 1,
                error,
              },
              'Failed to re-enqueue recovered document for processing'
            );
          }
        }

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
      requeueEnabled: documentConfig.processingRecoveryRequeueEnabled,
      scannedCount: staleDocuments.length,
      recoveredCount: recoveredDocumentIds.length,
      skippedCount: skippedDocumentIds.length,
      requeuedCount: requeuedDocumentIds.length,
      requeueFailedCount: requeueFailedDocumentIds.length,
      recoveredDocumentIds,
      skippedDocumentIds,
      requeuedDocumentIds,
      requeueFailedDocumentIds,
    };
  },
};
