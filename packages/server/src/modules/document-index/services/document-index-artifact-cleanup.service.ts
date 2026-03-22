import { documentConfig } from '@config/env';
import { documentChunkRepository } from '@modules/document/public/repositories';
import { knowledgeBaseService } from '@modules/knowledge-base/public/management';
import { vectorRepository } from '@modules/vector';
import { createLogger } from '@core/logger';
import { documentIndexVersionRepository } from '../repositories/document-index-version.repository';

const logger = createLogger('document-index-artifact-cleanup.service');

export interface DocumentIndexArtifactCleanupResult {
  retentionDays: number;
  builtBefore: string;
  scannedCount: number;
  cleanedCount: number;
  skippedCount: number;
  failedCount: number;
  cleanedIndexVersionIds: string[];
  skippedIndexVersionIds: string[];
  failedIndexVersionIds: string[];
}

export const documentIndexArtifactCleanupService = {
  buildCutoff(now: Date = new Date()): Date {
    return new Date(now.getTime() - documentConfig.buildCleanupRetentionDays * 24 * 60 * 60_000);
  },

  async cleanup(now: Date = new Date()): Promise<DocumentIndexArtifactCleanupResult> {
    const builtBefore = this.buildCutoff(now);
    const candidates = await documentIndexVersionRepository.listCleanupCandidates(
      builtBefore,
      documentConfig.buildCleanupBatchSize
    );

    const cleanedIndexVersionIds: string[] = [];
    const skippedIndexVersionIds: string[] = [];
    const failedIndexVersionIds: string[] = [];

    for (const candidate of candidates) {
      try {
        const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(
          candidate.knowledgeBaseId
        );
        const chunkCount = await documentChunkRepository.countByIndexVersionId(
          candidate.indexVersionId
        );
        const softDeleted = await vectorRepository.deleteByIndexVersionId(
          embeddingConfig.collectionName,
          candidate.indexVersionId
        );

        if (!softDeleted) {
          skippedIndexVersionIds.push(candidate.indexVersionId);
          logger.warn(
            {
              documentId: candidate.documentId,
              documentVersion: candidate.documentVersion,
              indexVersionId: candidate.indexVersionId,
              status: candidate.status,
            },
            'Skipping immutable build cleanup because vector soft delete failed'
          );
          continue;
        }

        await documentIndexVersionRepository.deleteById(candidate.indexVersionId);
        cleanedIndexVersionIds.push(candidate.indexVersionId);

        logger.info(
          {
            documentId: candidate.documentId,
            documentVersion: candidate.documentVersion,
            indexVersionId: candidate.indexVersionId,
            knowledgeBaseId: candidate.knowledgeBaseId,
            status: candidate.status,
            chunkCount,
          },
          'Cleaned immutable document build artifacts'
        );
      } catch (error) {
        failedIndexVersionIds.push(candidate.indexVersionId);
        logger.error(
          {
            documentId: candidate.documentId,
            documentVersion: candidate.documentVersion,
            indexVersionId: candidate.indexVersionId,
            knowledgeBaseId: candidate.knowledgeBaseId,
            error,
          },
          'Failed to clean immutable document build artifacts'
        );
      }
    }

    return {
      retentionDays: documentConfig.buildCleanupRetentionDays,
      builtBefore: builtBefore.toISOString(),
      scannedCount: candidates.length,
      cleanedCount: cleanedIndexVersionIds.length,
      skippedCount: skippedIndexVersionIds.length,
      failedCount: failedIndexVersionIds.length,
      cleanedIndexVersionIds,
      skippedIndexVersionIds,
      failedIndexVersionIds,
    };
  },
};
