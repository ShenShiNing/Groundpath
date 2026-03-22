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
import { buildPagination } from '@core/utils';
import { documentRepository } from '../repositories/document.repository';
import { documentVersionRepository } from '../repositories/document-version.repository';
import { documentChunkRepository } from '../repositories/document-chunk.repository';
import { documentStorageService } from './document-storage.service';
import { createLogger } from '@core/logger';
import { logOperation } from '@core/logger/operation-logger';
import { dispatchDocumentProcessing } from '../ports/document-processing.port';
import { vectorRepository } from '@modules/vector';
import { knowledgeBaseService } from '@modules/knowledge-base';

const logger = createLogger('document-trash.service');

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
    const { documents, total } = await documentRepository.listDeleted(userId, params);

    return {
      documents: documents.map(toTrashDocumentListItem),
      pagination: buildPagination(total, params.page, params.pageSize),
    };
  },

  /**
   * Restore a deleted document
   * MySQL operations are wrapped in a transaction for atomicity.
   */
  async restore(documentId: string, userId: string, ctx?: RequestContext): Promise<DocumentInfo> {
    const startTime = Date.now();
    const document = await documentRepository.findDeletedByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found in trash',
        404
      );
    }

    // Idempotency check: already restored
    if (!document.deletedAt) {
      return toDocumentInfo(document);
    }

    // All MySQL operations in a single transaction
    const restored = await withTransaction(async (tx) => {
      // 1. Restore document
      const restoredDoc = await documentRepository.restore(documentId, tx);

      // 2. Reset processing status (chunkCount was already set to 0 on soft delete)
      await documentRepository.update(
        documentId,
        {
          processingStatus: 'pending',
          processingError: null,
        },
        tx
      );

      // 3. Increment document count
      await knowledgeBaseService.incrementDocumentCount(document.knowledgeBaseId, 1, tx);

      return restoredDoc;
    });

    // 4. Enqueue reprocessing (will update totalChunks via delta calculation)
    dispatchDocumentProcessing(documentId, userId, {
      targetDocumentVersion: document.currentVersion,
      reason: 'restore',
    }).catch((err) => {
      logger.warn({ documentId, err }, 'Failed to enqueue processing after restore');
    });

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: document.title,
      action: 'document.restore',
      description: `Restored document from trash: ${document.title}`,
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return toDocumentInfo(restored!);
  },

  /**
   * Permanently delete a document
   * MySQL operations are wrapped in a transaction for atomicity.
   * Storage and Qdrant operations run outside the transaction.
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

    // DB transaction FIRST — removes metadata before external resources
    // If this fails, storage and vectors remain intact (consistent state)
    await withTransaction(async (tx) => {
      await documentChunkRepository.deleteByDocumentId(documentId, tx);
      await documentVersionRepository.deleteByDocumentId(documentId, tx);
      await documentRepository.hardDelete(documentId, tx);
    });

    // AFTER DB success: clean up storage files (best effort)
    // Orphaned files are acceptable — a background cleanup job can sweep them
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

    // AFTER DB success: clean up vectors (best effort)
    try {
      const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(
        document.knowledgeBaseId
      );
      await vectorRepository.deleteByDocumentId(embeddingConfig.collectionName, documentId);
    } catch (err) {
      logger.warn({ documentId, err }, 'Failed to delete vectors from Qdrant after DB commit');
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
