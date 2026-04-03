import { DOCUMENT_ERROR_CODES } from '@groundpath/shared';
import type {
  TrashListParams,
  TrashDocumentListItem,
  TrashListResponse,
  DocumentInfo,
} from '@groundpath/shared/types';
import type { Document } from '@core/db/schema/document/documents.schema';
import { withTransaction } from '@core/db/db.utils';
import { Errors } from '@core/errors';
import { dispatchDocumentProcessing } from '@core/document-processing';
import { buildCursorPagination, normalizePageSize } from '@core/utils';
import { documentRepository } from '../repositories/document.repository';
import { documentVersionRepository } from '../repositories/document-version.repository';
import { documentChunkRepository } from '../repositories/document-chunk.repository';
import { documentStorageService } from './document-storage.service';
import { createLogger } from '@core/logger';
import { logOperation } from '@core/logger/operation-logger';
import { knowledgeBaseService } from '@modules/knowledge-base/public/management';
import { vectorRepository } from '@modules/vector/public/repositories';

const logger = createLogger('document-trash.service');

function documentNotFoundInTrashError(message: string = 'Document not found in trash') {
  return Errors.auth(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND', message, 404);
}

/**
 * Request context for logging
 */
interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

interface ClearTrashResult {
  deletedCount: number;
  failedCount: number;
}

/**
 * Convert database document to API document info
 */
function toDocumentInfo(doc: Document): DocumentInfo {
  return {
    id: doc.id,
    userId: doc.userId,
    title: doc.title,
    description: doc.description,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    fileExtension: doc.fileExtension,
    documentType: doc.documentType,
    currentVersion: doc.currentVersion,
    processingStatus: doc.processingStatus,
    chunkCount: doc.chunkCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Convert database document to list item
 */
function toDocumentListItem(doc: Document) {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    fileExtension: doc.fileExtension,
    documentType: doc.documentType,
    processingStatus: doc.processingStatus,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Convert database document to trash list item
 */
function toTrashDocumentListItem(doc: Document): TrashDocumentListItem {
  return {
    ...toDocumentListItem(doc),
    deletedAt: doc.deletedAt!,
  };
}

/**
 * Document trash service for trash/restore operations
 */
export const documentTrashService = {
  /**
   * List deleted documents (trash)
   */
  async listTrash(userId: string, params: TrashListParams): Promise<TrashListResponse> {
    const pageSize = normalizePageSize(params.pageSize);
    const { documents, total, hasMore, nextCursor } = await documentRepository.listDeleted(userId, {
      ...params,
      pageSize,
    });

    return {
      documents: documents.map(toTrashDocumentListItem),
      pagination: buildCursorPagination(total, pageSize, hasMore, nextCursor),
    };
  },

  /**
   * Restore a deleted document
   * MySQL operations are wrapped in a transaction for atomicity.
   */
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
      // Match knowledge-base-first locking to avoid deadlocks with KB-level orchestration.
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

    // 4. Enqueue reprocessing (will update totalChunks via delta calculation)
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

    // Log operation
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

  /**
   * Permanently delete a document
   *
   * Order of operations (compensation-safe):
   * 1. Soft-delete vectors BEFORE DB hard-delete — makes them invisible to
   *    search immediately. If this fails, abort so DB records remain intact
   *    and the user can retry.
   * 2. DB transaction — hard-deletes metadata.
   * 3. Best-effort cleanup — storage files + physical vector deletion.
   *    The daily vector-cleanup job sweeps any soft-deleted vectors that
   *    fail to be physically removed here.
   */
  async permanentDelete(documentId: string, userId: string, ctx?: RequestContext): Promise<void> {
    const startTime = Date.now();
    const document = await documentRepository.findDeletedByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found in trash',
        404
      );
    }

    // Get version list before transaction (needed for storage cleanup)
    const versions = await documentVersionRepository.listByDocumentId(documentId);

    // Collect storage keys for cleanup after DB transaction
    const storageKeys = versions.map((v) => v.storageKey);

    // STEP 1: Soft-delete vectors BEFORE DB hard-delete.
    // This ensures vectors are excluded from search immediately.
    // If Qdrant is unreachable, we abort so the user can retry later
    // (DB records stay intact → no orphaned vectors).
    const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(document.knowledgeBaseId);
    const softDeleted = await vectorRepository.markAsDeleted(embeddingConfig.collectionName, {
      documentId,
    });
    if (!softDeleted) {
      throw Errors.external(
        'Failed to mark vectors as deleted in Qdrant — aborting permanent delete to prevent orphaned vectors. Please retry later.',
        { documentId }
      );
    }

    // STEP 2: DB transaction — removes metadata.
    // If this fails, vectors are soft-deleted but the document is still in
    // trash; restoring it will re-dispatch processing and create new vectors.
    await withTransaction(async (tx) => {
      await documentChunkRepository.deleteByDocumentId(documentId, tx);
      await documentVersionRepository.deleteByDocumentId(documentId, tx);
      await documentRepository.hardDelete(documentId, tx);
    });

    // STEP 3: Best-effort cleanup of storage files.
    // Orphaned files are acceptable — a background cleanup job can sweep them.
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

    // STEP 4: Physically remove soft-deleted vectors (best effort).
    // If this fails, the daily vector-cleanup job will purge them.
    try {
      await vectorRepository.deleteByDocumentId(embeddingConfig.collectionName, documentId);
    } catch (err) {
      logger.warn(
        { documentId, err },
        'Physical vector deletion failed after DB commit — daily cleanup will handle it'
      );
    }

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: document.title,
      action: 'document.permanent_delete',
      description: `Permanently deleted document: ${document.title}`,
      metadata: {
        fileName: document.fileName,
        fileSize: document.fileSize,
        versionsDeleted: versions.length,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
  },

  /**
   * Permanently delete all documents in trash.
   * Best effort: continue deleting remaining documents when a single document fails.
   */
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
