import { DOCUMENT_ERROR_CODES } from '@knowledge-agent/shared';
import type {
  DocumentInfo,
  DocumentListItem,
  DocumentListResponse,
  DocumentListParams,
  UpdateDocumentRequest,
  TrashListParams,
  TrashListResponse,
  VersionListResponse,
  DocumentContentResponse,
  SaveDocumentContentRequest,
} from '@knowledge-agent/shared/types';
import type { Document } from '@core/db/schema/document/documents.schema';
import { withTransaction } from '@core/db/db.utils';
import { Errors } from '@core/errors';
import { buildPagination } from '@core/utils';
import { documentRepository } from '../repositories/document.repository';
import { documentChunkRepository } from '../repositories/document-chunk.repository';
import { createLogger } from '@core/logger';
import { logOperation } from '@core/logger/operation-logger';
import { vectorRepository } from '@modules/vector';
import { knowledgeBaseService } from '@modules/knowledge-base/services/knowledge-base.service';
import { documentTrashService } from './document-trash.service';
import { documentVersionService } from './document-version.service';
import { documentUploadService } from './document-upload.service';
import { documentContentService } from './document-content.service';
import type { RequestContext, UploadFileInput, UploadOptions } from './document-upload.service';
import { toDocumentInfo } from './document-upload.service';

const logger = createLogger('document.service');

/**
 * Convert database document to list item
 */
function toDocumentListItem(doc: Document): DocumentListItem {
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
 * Document service - Facade for all document operations
 *
 * This service acts as the main entry point for document operations,
 * delegating to specialized sub-services for specific functionality:
 * - documentUploadService: handles document uploads
 * - documentContentService: handles content read/write and downloads
 * - documentTrashService: handles trash/restore operations
 * - documentVersionService: handles version management
 */
export const documentService = {
  // ==================== Upload Operations (delegated) ====================

  /**
   * Upload a new document
   */
  upload(
    userId: string,
    file: UploadFileInput,
    options?: UploadOptions,
    ctx?: RequestContext
  ): Promise<DocumentInfo> {
    return documentUploadService.upload(userId, file, options, ctx);
  },

  // ==================== Core CRUD Operations ====================

  /**
   * Get document by ID (with ownership check)
   */
  async getById(documentId: string, userId: string): Promise<DocumentInfo> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }
    return toDocumentInfo(document);
  },

  /**
   * Get processing state for a document (with ownership check)
   */
  async getProcessingState(
    documentId: string,
    userId: string
  ): Promise<{
    id: string;
    currentVersion: number;
    processingStatus: Document['processingStatus'];
    processingError: Document['processingError'];
    chunkCount: number;
  }> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    return {
      id: document.id,
      currentVersion: document.currentVersion,
      processingStatus: document.processingStatus,
      processingError: document.processingError,
      chunkCount: document.chunkCount,
    };
  },

  /**
   * List documents with pagination and filtering
   */
  async list(userId: string, params: DocumentListParams): Promise<DocumentListResponse> {
    const { documents, total } = await documentRepository.list(userId, params);

    return {
      documents: documents.map(toDocumentListItem),
      pagination: buildPagination(total, params.page, params.pageSize),
    };
  },

  /**
   * Update document metadata
   */
  async update(
    documentId: string,
    userId: string,
    data: UpdateDocumentRequest,
    ctx?: RequestContext
  ): Promise<DocumentInfo> {
    const startTime = Date.now();
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    // Capture old values for logging
    const oldValue = {
      title: document.title,
      description: document.description,
    };

    const updated = await documentRepository.update(documentId, {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      updatedBy: userId,
    });

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: updated!.title,
      action: 'document.update',
      description: 'Updated document metadata',
      oldValue,
      newValue: {
        title: data.title ?? document.title,
        description: data.description ?? document.description,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return toDocumentInfo(updated!);
  },

  /**
   * Delete document (soft delete)
   * MySQL operations are wrapped in a transaction for atomicity.
   * Qdrant operations run outside the transaction (eventual consistency).
   */
  async delete(documentId: string, userId: string, ctx?: RequestContext): Promise<void> {
    const startTime = Date.now();
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    const currentChunkCount = document.chunkCount;

    // All MySQL operations in a single transaction
    await withTransaction(async (tx) => {
      // 1. Soft delete document and reset chunkCount
      await documentRepository.softDelete(documentId, userId, tx);
      await documentRepository.update(documentId, { chunkCount: 0 }, tx);

      // 2. Delete chunks from MySQL
      await documentChunkRepository.deleteByDocumentId(documentId, tx);

      // 3. Update knowledge base counters
      await knowledgeBaseService.incrementDocumentCount(document.knowledgeBaseId, -1, tx);
      if (currentChunkCount > 0) {
        await knowledgeBaseService.incrementTotalChunks(
          document.knowledgeBaseId,
          -currentChunkCount,
          tx
        );
      }
    });

    // 4. Delete vectors from Qdrant (outside transaction - eventual consistency)
    try {
      const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(
        document.knowledgeBaseId
      );
      await vectorRepository.deleteByDocumentId(embeddingConfig.collectionName, documentId);
    } catch (err) {
      logger.warn(
        { documentId, chunkCount: currentChunkCount, err },
        'Vector deletion failed - vectors marked as deleted for search exclusion'
      );
    }

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: document.title,
      action: 'document.delete',
      description: `Moved document to trash: ${document.title}`,
      metadata: {
        chunksDeleted: currentChunkCount,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
  },

  // ==================== Content Operations (delegated) ====================

  /**
   * Get current content of a document (with ownership check)
   */
  getContent(documentId: string, userId: string): Promise<DocumentContentResponse> {
    return documentContentService.getContent(documentId, userId);
  },

  /**
   * Save document content (markdown/text only)
   */
  saveContent(
    documentId: string,
    userId: string,
    data: SaveDocumentContentRequest,
    ctx?: RequestContext
  ): Promise<DocumentInfo> {
    return documentContentService.saveContent(documentId, userId, data, ctx);
  },

  /**
   * Get document download stream info
   */
  getDownloadStream(
    documentId: string,
    userId: string,
    ctx?: RequestContext
  ): Promise<{
    body: AsyncIterable<Uint8Array>;
    fileName: string;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    return documentContentService.getDownloadStream(documentId, userId, ctx);
  },

  // ==================== Trash Operations (delegated) ====================

  /**
   * List deleted documents (trash)
   */
  listTrash(userId: string, params: TrashListParams): Promise<TrashListResponse> {
    return documentTrashService.listTrash(userId, params);
  },

  /**
   * Restore a deleted document
   */
  restore(documentId: string, userId: string, ctx?: RequestContext): Promise<DocumentInfo> {
    return documentTrashService.restore(documentId, userId, ctx);
  },

  /**
   * Permanently delete a document
   */
  permanentDelete(documentId: string, userId: string, ctx?: RequestContext): Promise<void> {
    return documentTrashService.permanentDelete(documentId, userId, ctx);
  },

  /**
   * Permanently delete all documents in trash
   */
  clearTrash(
    userId: string,
    ctx?: RequestContext
  ): Promise<{ deletedCount: number; failedCount: number }> {
    return documentTrashService.clearTrash(userId, ctx);
  },

  // ==================== Version Operations (delegated) ====================

  /**
   * Upload a new version of a document
   */
  uploadNewVersion(
    documentId: string,
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    options?: { changeNote?: string },
    ctx?: RequestContext
  ): Promise<DocumentInfo> {
    return documentVersionService.uploadNewVersion(documentId, userId, file, options, ctx);
  },

  /**
   * Get version history for a document
   */
  getVersionHistory(documentId: string, userId: string): Promise<VersionListResponse> {
    return documentVersionService.getVersionHistory(documentId, userId);
  },

  /**
   * Restore document to a specific version
   */
  restoreVersion(
    documentId: string,
    versionId: string,
    userId: string,
    ctx?: RequestContext
  ): Promise<DocumentInfo> {
    return documentVersionService.restoreVersion(documentId, versionId, userId, ctx);
  },
};

// Re-export types and sub-services for direct access
export type { RequestContext, UploadFileInput, UploadOptions } from './document-upload.service';
export { toDocumentInfo } from './document-upload.service';
export { documentTrashService } from './document-trash.service';
export { documentVersionService } from './document-version.service';
export { documentUploadService } from './document-upload.service';
export { documentContentService } from './document-content.service';
