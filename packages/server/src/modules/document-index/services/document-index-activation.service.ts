import { afterTransactionCommit, withTransaction, type Transaction } from '@core/db/db.utils';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import { documentRepository } from '@modules/document';
import { knowledgeBaseService } from '@modules/knowledge-base';
import { documentIndexVersionRepository } from '../repositories/document-index-version.repository';
import { documentIndexCacheService } from './document-index-cache.service';

const logger = createLogger('document-index-activation.service');

interface CacheInvalidationContext {
  documentId?: string;
  indexVersionId: string;
  userId?: string;
  knowledgeBaseId?: string | null;
}

function shouldInvalidateCaches(context: CacheInvalidationContext): boolean {
  return Boolean(context.documentId || (context.userId && context.knowledgeBaseId));
}

async function invalidateCaches(context: CacheInvalidationContext): Promise<void> {
  if (context.documentId) {
    await documentIndexCacheService.invalidateDocumentCaches(
      context.documentId,
      context.indexVersionId
    );
  }

  await documentIndexCacheService.invalidateQueryCaches({
    userId: context.userId,
    knowledgeBaseId: context.knowledgeBaseId,
  });
}

async function hydrateCacheInvalidationContext(
  context: CacheInvalidationContext,
  documentId: string,
  tx: Transaction
) {
  context.documentId = documentId;

  const document = await documentRepository.findById(documentId, tx);
  context.userId = document?.userId;
  context.knowledgeBaseId = document?.knowledgeBaseId;

  return document;
}

async function findVersionOrThrow(indexVersionId: string, tx: Transaction) {
  const version = await documentIndexVersionRepository.findById(indexVersionId, tx);
  if (!version) {
    throw Errors.notFound('Document index version');
  }

  return version;
}

async function withCacheInvalidation<T>(
  indexVersionId: string,
  operation: (tx: Transaction, context: CacheInvalidationContext) => Promise<T>,
  tx?: Transaction
): Promise<T> {
  return withTransaction(async (trx) => {
    const context: CacheInvalidationContext = { indexVersionId };
    const result = await operation(trx, context);

    if (shouldInvalidateCaches(context)) {
      await afterTransactionCommit(() => invalidateCaches(context), trx);
    }

    return result;
  }, tx);
}

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
    return withCacheInvalidation(
      indexVersionId,
      async (trx, cacheContext) => {
        const version = await findVersionOrThrow(indexVersionId, trx);

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

        await hydrateCacheInvalidationContext(cacheContext, version.documentId, trx);

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
      },
      tx
    );
  },

  async markFailed(indexVersionId: string, error: string, tx?: Transaction) {
    return withCacheInvalidation(
      indexVersionId,
      async (trx, cacheContext) => {
        const version = await findVersionOrThrow(indexVersionId, trx);

        const failedVersion = await documentIndexVersionRepository.update(
          version.id,
          {
            status: 'failed',
            error,
          },
          trx
        );

        const document = await hydrateCacheInvalidationContext(
          cacheContext,
          version.documentId,
          trx
        );
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
      },
      tx
    );
  },

  async markSuperseded(indexVersionId: string, tx?: Transaction) {
    return withCacheInvalidation(
      indexVersionId,
      async (trx, cacheContext) => {
        const version = await findVersionOrThrow(indexVersionId, trx);

        const supersededVersion = await documentIndexVersionRepository.update(
          version.id,
          {
            status: 'superseded',
          },
          trx
        );

        const document = await hydrateCacheInvalidationContext(
          cacheContext,
          version.documentId,
          trx
        );
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
      },
      tx
    );
  },
};
