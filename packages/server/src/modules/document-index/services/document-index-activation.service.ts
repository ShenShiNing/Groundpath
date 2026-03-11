import { withTransaction, type Transaction } from '@shared/db/db.utils';
import { Errors } from '@shared/errors';
import { createLogger } from '@shared/logger';
import { documentRepository } from '@modules/document';
import { knowledgeBaseService } from '@modules/knowledge-base';
import { documentIndexVersionRepository } from '../repositories/document-index-version.repository';
import { documentIndexCacheService } from './document-index-cache.service';

const logger = createLogger('document-index-activation.service');

export const documentIndexActivationService = {
  async activateVersion(
    indexVersionId: string,
    options?: {
      expectedPublishGeneration?: number;
      chunkCount?: number;
      knowledgeBaseId?: string;
      chunkDelta?: number;
    },
    tx?: Transaction
  ) {
    let documentIdForInvalidation: string | undefined;
    let userIdForInvalidation: string | undefined;
    let knowledgeBaseIdForInvalidation: string | undefined;
    const activatedVersion = await withTransaction(async (trx) => {
      const version = await documentIndexVersionRepository.findById(indexVersionId, trx);
      if (!version) {
        throw Errors.notFound('Document index version');
      }
      documentIdForInvalidation = version.documentId;

      if (options?.expectedPublishGeneration !== undefined) {
        const published = await documentRepository.publishBuild({
          documentId: version.documentId,
          activeIndexVersionId: version.id,
          expectedPublishGeneration: options.expectedPublishGeneration,
          chunkCount: options.chunkCount ?? 0,
          tx: trx,
        });

        if (!published) {
          await documentIndexVersionRepository.update(
            version.id,
            {
              status: 'superseded',
              error: 'Publish fencing rejected stale build activation',
            },
            trx
          );
          return undefined;
        }
      } else {
        await documentRepository.update(
          version.documentId,
          {
            activeIndexVersionId: version.id,
          },
          trx
        );
      }

      await documentIndexVersionRepository.supersedeActiveByDocumentId(
        version.documentId,
        version.id,
        trx
      );
      const activatedVersion = await documentIndexVersionRepository.update(
        version.id,
        {
          status: 'active',
          error: null,
          activatedAt: new Date(),
        },
        trx
      );

      if (options?.chunkDelta && options.chunkDelta !== 0 && options.knowledgeBaseId) {
        await knowledgeBaseService.incrementTotalChunks(
          options.knowledgeBaseId,
          options.chunkDelta,
          trx
        );
      }

      const document = await documentRepository.findById(version.documentId, trx);
      userIdForInvalidation = document?.userId;
      knowledgeBaseIdForInvalidation = document?.knowledgeBaseId;

      logger.info(
        {
          documentId: version.documentId,
          documentVersion: version.documentVersion,
          indexVersionId: version.id,
          indexVersion: version.indexVersion,
        },
        'Activated document index version'
      );

      return activatedVersion;
    }, tx);
    if (!activatedVersion) {
      return undefined;
    }
    if (documentIdForInvalidation) {
      await documentIndexCacheService.invalidateDocumentCaches(
        documentIdForInvalidation,
        indexVersionId
      );
    }
    await documentIndexCacheService.invalidateQueryCaches({
      userId: userIdForInvalidation,
      knowledgeBaseId: knowledgeBaseIdForInvalidation,
    });
    return activatedVersion;
  },

  async markFailed(indexVersionId: string, error: string, tx?: Transaction) {
    let documentIdForInvalidation: string | undefined;
    let userIdForInvalidation: string | undefined;
    let knowledgeBaseIdForInvalidation: string | undefined;
    const failedVersion = await withTransaction(async (trx) => {
      const version = await documentIndexVersionRepository.findById(indexVersionId, trx);
      if (!version) {
        throw Errors.notFound('Document index version');
      }
      documentIdForInvalidation = version.documentId;

      const failedVersion = await documentIndexVersionRepository.update(
        version.id,
        {
          status: 'failed',
          error,
        },
        trx
      );

      const document = await documentRepository.findById(version.documentId, trx);
      userIdForInvalidation = document?.userId;
      knowledgeBaseIdForInvalidation = document?.knowledgeBaseId;
      if (document?.activeIndexVersionId === version.id) {
        await documentRepository.update(
          version.documentId,
          {
            activeIndexVersionId: null,
          },
          trx
        );
      }

      logger.warn(
        {
          documentId: version.documentId,
          documentVersion: version.documentVersion,
          indexVersionId: version.id,
          error,
        },
        'Marked document index version as failed'
      );

      return failedVersion;
    }, tx);
    if (documentIdForInvalidation) {
      await documentIndexCacheService.invalidateDocumentCaches(
        documentIdForInvalidation,
        indexVersionId
      );
    }
    await documentIndexCacheService.invalidateQueryCaches({
      userId: userIdForInvalidation,
      knowledgeBaseId: knowledgeBaseIdForInvalidation,
    });
    return failedVersion;
  },

  async markSuperseded(indexVersionId: string, tx?: Transaction) {
    let documentIdForInvalidation: string | undefined;
    let userIdForInvalidation: string | undefined;
    let knowledgeBaseIdForInvalidation: string | undefined;
    const supersededVersion = await withTransaction(async (trx) => {
      const version = await documentIndexVersionRepository.findById(indexVersionId, trx);
      if (!version) {
        throw Errors.notFound('Document index version');
      }
      documentIdForInvalidation = version.documentId;

      const supersededVersion = await documentIndexVersionRepository.update(
        version.id,
        {
          status: 'superseded',
        },
        trx
      );

      const document = await documentRepository.findById(version.documentId, trx);
      userIdForInvalidation = document?.userId;
      knowledgeBaseIdForInvalidation = document?.knowledgeBaseId;
      if (document?.activeIndexVersionId === version.id) {
        await documentRepository.update(
          version.documentId,
          {
            activeIndexVersionId: null,
          },
          trx
        );
      }

      logger.info(
        {
          documentId: version.documentId,
          documentVersion: version.documentVersion,
          indexVersionId: version.id,
        },
        'Marked document index version as superseded'
      );

      return supersededVersion;
    }, tx);
    if (documentIdForInvalidation) {
      await documentIndexCacheService.invalidateDocumentCaches(
        documentIdForInvalidation,
        indexVersionId
      );
    }
    await documentIndexCacheService.invalidateQueryCaches({
      userId: userIdForInvalidation,
      knowledgeBaseId: knowledgeBaseIdForInvalidation,
    });
    return supersededVersion;
  },
};
