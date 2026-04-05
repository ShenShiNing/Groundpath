import { DOCUMENT_ERROR_CODES } from '@groundpath/shared';
import type { DocumentInfo } from '@groundpath/shared/types';
import { withTransaction } from '@core/db/db.utils';
import { Errors } from '@core/errors';
import { dispatchDocumentProcessing } from '@core/document-processing';
import { createLogger } from '@core/logger';
import { logOperation } from '@core/logger/operation-logger';
import { knowledgeBaseService } from '@modules/knowledge-base/public/management';
import { vectorRepository } from '@modules/vector/public/repositories';
import { documentChunkRepository } from '../repositories/document-chunk.repository';
import { documentRepository } from '../repositories/document.repository';
import { documentVersionRepository } from '../repositories/document-version.repository';
import { documentStorageService } from './document-storage.service';
import type { RequestContext } from './document-upload.service';
import { toDocumentInfo } from './document-upload.service';

const logger = createLogger('document-lifecycle.service');

export interface ClearTrashResult {
  deletedCount: number;
  failedCount: number;
}

function documentNotFoundError(message: string = 'Document not found') {
  return Errors.auth(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND', message, 404);
}

function documentNotFoundInTrashError(message: string = 'Document not found in trash') {
  return Errors.auth(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND', message, 404);
}

export const documentLifecycleService = {
  async delete(documentId: string, userId: string, ctx?: RequestContext): Promise<void> {
    const startTime = Date.now();
    const ownedDocument = await documentRepository.findByIdAndUserIncludingDeleted(
      documentId,
      userId
    );
    if (!ownedDocument) {
      throw documentNotFoundError();
    }

    const deletion = await withTransaction(async (tx) => {
      await knowledgeBaseService.lockOwnership(ownedDocument.knowledgeBaseId, userId, tx);

      const lockedDocument = await documentRepository.lockByIdAndUser(documentId, userId, tx);
      if (!lockedDocument) {
        throw documentNotFoundError();
      }

      if (lockedDocument.deletedAt) {
        return {
          deleted: false as const,
          chunkCount: 0,
          document: lockedDocument,
        };
      }

      const currentChunkCount = lockedDocument.chunkCount;

      if (currentChunkCount > 0) {
        await documentRepository.update(documentId, { chunkCount: 0 }, tx);
      }

      await documentRepository.softDelete(documentId, userId, tx);
      await documentChunkRepository.deleteByDocumentId(documentId, tx);
      await knowledgeBaseService.incrementDocumentCount(lockedDocument.knowledgeBaseId, -1, tx);

      if (currentChunkCount > 0) {
        await knowledgeBaseService.incrementTotalChunks(
          lockedDocument.knowledgeBaseId,
          -currentChunkCount,
          tx
        );
      }

      return {
        deleted: true as const,
        chunkCount: currentChunkCount,
        document: lockedDocument,
      };
    });

    if (!deletion.deleted) {
      return;
    }

    try {
      const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(
        deletion.document.knowledgeBaseId
      );
      await vectorRepository.deleteByDocumentId(embeddingConfig.collectionName, documentId);
    } catch (err) {
      logger.warn(
        { documentId, chunkCount: deletion.chunkCount, err },
        'Vector deletion failed - vectors marked as deleted for search exclusion'
      );
    }

    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: deletion.document.title,
      action: 'document.delete',
      description: `Moved document to trash: ${deletion.document.title}`,
      metadata: {
        chunksDeleted: deletion.chunkCount,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
  },

  async restore(documentId: string, userId: string, ctx?: RequestContext): Promise<DocumentInfo> {
    const startTime = Date.now();
    const ownedDocument = await documentRepository.findByIdAndUserIncludingDeleted(
      documentId,
      userId
    );
    if (!ownedDocument) {
      throw documentNotFoundInTrashError();
    }

    const restoration = await withTransaction(async (tx) => {
      await knowledgeBaseService.lockOwnership(ownedDocument.knowledgeBaseId, userId, tx);

      const lockedDocument = await documentRepository.lockByIdAndUser(documentId, userId, tx);
      if (!lockedDocument) {
        throw documentNotFoundInTrashError();
      }

      if (!lockedDocument.deletedAt) {
        return {
          restored: false as const,
          document: lockedDocument,
        };
      }

      await documentRepository.restore(documentId, tx);
      const updatedDocument = await documentRepository.update(
        documentId,
        {
          processingStatus: 'pending',
          processingError: null,
        },
        tx
      );

      await knowledgeBaseService.incrementDocumentCount(lockedDocument.knowledgeBaseId, 1, tx);

      return {
        restored: true as const,
        document: updatedDocument ?? { ...lockedDocument, deletedAt: null, deletedBy: null },
      };
    });

    if (!restoration.restored) {
      return toDocumentInfo(restoration.document);
    }

    dispatchDocumentProcessing(documentId, userId, {
      targetDocumentVersion: restoration.document.currentVersion,
      reason: 'restore',
    }).catch((err) => {
      logger.warn({ documentId, err }, 'Failed to enqueue processing after restore');
      documentRepository
        .updateProcessingStatus(
          documentId,
          'failed',
          `Dispatch failed: ${err instanceof Error ? err.message : String(err)}`
        )
        .catch((updateErr) => {
          logger.error(
            { documentId, updateErr },
            'Failed to mark document as failed after dispatch error'
          );
        });
    });

    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: restoration.document.title,
      action: 'document.restore',
      description: `Restored document from trash: ${restoration.document.title}`,
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return toDocumentInfo(restoration.document);
  },

  async permanentDelete(documentId: string, userId: string, ctx?: RequestContext): Promise<void> {
    const startTime = Date.now();
    const ownedDocument = await documentRepository.findByIdAndUserIncludingDeleted(
      documentId,
      userId
    );
    if (!ownedDocument) {
      throw documentNotFoundInTrashError();
    }

    const versions = await documentVersionRepository.listByDocumentId(documentId);
    const storageKeys = versions.map((version) => version.storageKey);

    const preflight = await withTransaction(async (tx) => {
      await knowledgeBaseService.lockOwnership(ownedDocument.knowledgeBaseId, userId, tx);

      const lockedDocument = await documentRepository.lockByIdAndUser(documentId, userId, tx);
      if (!lockedDocument) {
        throw documentNotFoundInTrashError();
      }

      if (!lockedDocument.deletedAt) {
        return null;
      }

      return lockedDocument;
    });

    if (!preflight) {
      throw documentNotFoundInTrashError();
    }

    const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(
      preflight.knowledgeBaseId
    );
    const softDeleted = await vectorRepository.markAsDeleted(embeddingConfig.collectionName, {
      documentId,
    });
    if (!softDeleted) {
      throw Errors.external(
        'Failed to mark vectors as deleted in Qdrant — aborting permanent delete to prevent orphaned vectors. Please retry later.',
        { documentId }
      );
    }

    const deletion = await withTransaction(async (tx) => {
      await knowledgeBaseService.lockOwnership(preflight.knowledgeBaseId, userId, tx);

      const lockedDocument = await documentRepository.lockByIdAndUser(documentId, userId, tx);
      if (!lockedDocument) {
        throw documentNotFoundInTrashError();
      }

      if (!lockedDocument.deletedAt) {
        return {
          deleted: false as const,
          document: lockedDocument,
        };
      }

      await documentChunkRepository.deleteByDocumentId(documentId, tx);
      await documentVersionRepository.deleteByDocumentId(documentId, tx);
      await documentRepository.hardDelete(documentId, tx);

      return {
        deleted: true as const,
        document: lockedDocument,
      };
    });

    if (!deletion.deleted) {
      logger.info(
        { documentId, userId },
        'Skipping permanent delete because the document left trash before hard delete commit'
      );
      return;
    }

    for (const key of storageKeys) {
      try {
        await documentStorageService.deleteDocument(key);
      } catch (err) {
        logger.warn(
          { storageKey: key, documentId, err },
          'Failed to delete file from storage after DB commit'
        );
      }
    }

    try {
      await vectorRepository.deleteByDocumentId(embeddingConfig.collectionName, documentId);
    } catch (err) {
      logger.warn(
        { documentId, err },
        'Physical vector deletion failed after DB commit — daily cleanup will handle it'
      );
    }

    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: deletion.document.title,
      action: 'document.permanent_delete',
      description: `Permanently deleted document: ${deletion.document.title}`,
      metadata: {
        fileName: deletion.document.fileName,
        fileSize: deletion.document.fileSize,
        versionsDeleted: versions.length,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
  },

  async clearTrash(userId: string, ctx?: RequestContext): Promise<ClearTrashResult> {
    const deletedIds = await documentRepository.listDeletedIds(userId);
    if (deletedIds.length === 0) {
      return { deletedCount: 0, failedCount: 0 };
    }

    let deletedCount = 0;
    let failedCount = 0;

    for (const documentId of deletedIds) {
      try {
        await this.permanentDelete(documentId, userId, ctx);
        deletedCount += 1;
      } catch (err) {
        failedCount += 1;
        logger.warn(
          { userId, documentId, err },
          'Failed to permanently delete document in clearTrash'
        );
      }
    }

    return { deletedCount, failedCount };
  },
};
