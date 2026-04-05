import { documentConfig } from '@config/env';
import { runExclusiveTask } from '@core/coordination';
import { dispatchDocumentProcessing } from '@core/document-processing';
import { createLogger } from '@core/logger';
import { documentProcessingService } from '@modules/document/public/processing';
import { processingService } from './processing.service';

const logger = createLogger('processing-recovery.service');
const PROCESSING_RECOVERY_LOCK_KEY = 'document-processing:recovery:lock';

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
    const staleDocuments = await documentProcessingService.listStaleProcessingCandidates({
      staleBefore,
      limit: documentConfig.processingRecoveryBatchSize,
    });

    const recoveredDocumentIds: string[] = [];
    const skippedDocumentIds: string[] = [];
    const requeuedDocumentIds: string[] = [];
    const requeueFailedDocumentIds: string[] = [];

    for (const document of staleDocuments) {
      try {
        const recovered = await documentProcessingService.recoverStaleProcessingCandidate({
          documentId: document.id,
          staleBefore,
        });

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
            const jobId = await dispatchDocumentProcessing(document.id, document.userId, {
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

  async runScheduledRecovery(now: Date = new Date()): Promise<ProcessingRecoveryResult> {
    return runExclusiveTask(() => this.recoverStaleProcessing(now), {
      key: PROCESSING_RECOVERY_LOCK_KEY,
      logger,
      lockBusyMessage:
        'Skipping stale document processing recovery because another instance already holds the lock',
      lockLostMessage: 'Failed to extend stale document processing recovery lock',
      releaseFailedMessage: 'Failed to release stale document processing recovery lock',
      onLocked: () => ({
        timeoutMinutes: documentConfig.processingTimeoutMinutes,
        staleBefore: this.buildStaleBefore(now).toISOString(),
        requeueEnabled: documentConfig.processingRecoveryRequeueEnabled,
        scannedCount: 0,
        recoveredCount: 0,
        skippedCount: 0,
        requeuedCount: 0,
        requeueFailedCount: 0,
        recoveredDocumentIds: [],
        skippedDocumentIds: [],
        requeuedDocumentIds: [],
        requeueFailedDocumentIds: [],
      }),
    });
  },
};
