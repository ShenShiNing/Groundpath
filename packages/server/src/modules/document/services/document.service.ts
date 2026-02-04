import { v4 as uuidv4 } from 'uuid';
import { DOCUMENT_ERROR_CODES, KNOWLEDGE_BASE_ERROR_CODES } from '@knowledge-agent/shared';
import type {
  DocumentInfo,
  DocumentListItem,
  DocumentListResponse,
  DocumentListParams,
  UpdateDocumentRequest,
  TrashListParams,
  TrashDocumentListItem,
  TrashListResponse,
  VersionListResponse,
  DocumentContentResponse,
} from '@knowledge-agent/shared/types';
import type { Document } from '@shared/db/schema/document/documents.schema';
import { withTransaction } from '@shared/db/db.utils';
import { Errors } from '@shared/errors';
import { buildPagination } from '@shared/utils/pagination';
import { documentRepository } from '../repositories/document.repository';
import { documentVersionRepository } from '../repositories/document-version.repository';
import { documentChunkRepository } from '../repositories/document-chunk.repository';
import { folderRepository } from '../repositories/folder.repository';
import { documentStorageService } from '../services/document-storage.service';
import { createLogger } from '@shared/logger';
import { logOperation } from '@shared/logger/operation-logger';
import { processingService } from '@modules/rag';
import { vectorRepository } from '@modules/vector';
import { knowledgeBaseService } from '@modules/knowledge-base';
import { storageProvider } from '@modules/storage';

const logger = createLogger('document.service');

/**
 * Request context for logging
 */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Convert database document to API document info
 */
function toDocumentInfo(doc: Document): DocumentInfo {
  return {
    id: doc.id,
    userId: doc.userId,
    folderId: doc.folderId,
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
function toDocumentListItem(doc: Document): DocumentListItem {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    fileExtension: doc.fileExtension,
    documentType: doc.documentType,
    folderId: doc.folderId,
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
 * Document service for business logic
 */
export const documentService = {
  /**
   * Upload a new document
   */
  async upload(
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    options?: { title?: string; description?: string; folderId?: string; knowledgeBaseId?: string },
    ctx?: RequestContext
  ): Promise<DocumentInfo> {
    const startTime = Date.now();

    // knowledgeBaseId is required
    if (!options?.knowledgeBaseId) {
      throw Errors.auth(
        KNOWLEDGE_BASE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND as 'KNOWLEDGE_BASE_NOT_FOUND',
        'Knowledge base ID is required',
        400
      );
    }

    // Validate knowledge base exists and belongs to user
    await knowledgeBaseService.validateOwnership(options.knowledgeBaseId, userId);

    // Validate file
    const validation = documentStorageService.validateFile(file);
    if (!validation.valid) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.INVALID_FILE_TYPE as 'INVALID_FILE_TYPE',
        validation.error!,
        400
      );
    }

    // Validate folder if specified (must belong to same KB)
    if (options?.folderId) {
      const folder = await folderRepository.findByIdAndUser(options.folderId, userId);
      if (!folder) {
        throw Errors.auth(
          DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND as 'FOLDER_NOT_FOUND',
          'Target folder not found',
          404
        );
      }
      if (folder.knowledgeBaseId !== options.knowledgeBaseId) {
        throw Errors.auth(
          DOCUMENT_ERROR_CODES.ACCESS_DENIED as 'ACCESS_DENIED',
          'Folder does not belong to this knowledge base',
          400
        );
      }
    }

    // Upload to storage
    const { storageKey, fileExtension, documentType, resolvedMimeType } =
      await documentStorageService.uploadDocument(userId, file);

    // Extract text content for supported document types
    let textContent: string | null = null;
    if (['markdown', 'text'].includes(documentType)) {
      textContent = file.buffer.toString('utf-8');
      if (textContent.length > 50000) {
        textContent = textContent.substring(0, 50000);
      }
    } else if (['pdf', 'docx'].includes(documentType)) {
      textContent = await documentStorageService.extractTextContent(storageKey, documentType);
    }

    const title = options?.title || file.originalname.replace(/\.[^/.]+$/, '');
    const docId = uuidv4();

    // Create first version
    await documentVersionRepository.create({
      id: uuidv4(),
      documentId: docId,
      version: 1,
      fileName: file.originalname,
      mimeType: resolvedMimeType,
      fileSize: file.size,
      fileExtension,
      documentType,
      storageKey,
      textContent,
      source: 'upload',
      createdBy: userId,
    });

    // Create document with cached fields
    const document = await documentRepository.create({
      id: docId,
      userId,
      folderId: options?.folderId ?? null,
      knowledgeBaseId: options.knowledgeBaseId,
      title,
      description: options?.description ?? null,
      currentVersion: 1,
      fileName: file.originalname,
      mimeType: resolvedMimeType,
      fileSize: file.size,
      fileExtension,
      documentType,
      processingStatus: 'pending',
      createdBy: userId,
    });

    // Increment knowledge base document count
    await knowledgeBaseService.incrementDocumentCount(options.knowledgeBaseId, 1);

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: docId,
      resourceName: title,
      action: 'document.upload',
      description: `Uploaded document: ${file.originalname}`,
      metadata: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: resolvedMimeType,
        documentType,
        folderId: options?.folderId ?? null,
        knowledgeBaseId: options.knowledgeBaseId,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    // Trigger async document processing for RAG
    processingService.processDocument(docId, userId).catch((err) => {
      logger.warn({ documentId: docId, err }, 'Failed to trigger document processing');
    });

    return toDocumentInfo(document);
  },

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
   * Get current content of a document (with ownership check)
   */
  async getContent(documentId: string, userId: string): Promise<DocumentContentResponse> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    const version = await documentVersionRepository.findByDocumentAndVersion(
      documentId,
      document.currentVersion
    );

    if (!version) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document version not found',
        404
      );
    }

    const isEditable = document.documentType === 'markdown' || document.documentType === 'text';
    let storageUrl: string | null = null;
    if (document.documentType === 'pdf') {
      storageUrl = `/api/documents/${documentId}/preview`;
    } else if (document.documentType === 'docx') {
      storageUrl = `/api/documents/${documentId}/download`;
    } else if (document.documentType === 'markdown' || document.documentType === 'text') {
      storageUrl = null;
    } else {
      storageUrl = storageProvider.getPublicUrl(version.storageKey);
    }

    return {
      id: document.id,
      title: document.title,
      fileName: version.fileName,
      documentType: document.documentType,
      textContent: version.textContent,
      currentVersion: document.currentVersion,
      processingStatus: document.processingStatus,
      isEditable,
      storageUrl,
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

    // Validate target folder if changing
    if (data.folderId !== undefined && data.folderId !== null) {
      const folder = await folderRepository.findByIdAndUser(data.folderId, userId);
      if (!folder) {
        throw Errors.auth(
          DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND as 'FOLDER_NOT_FOUND',
          'Target folder not found',
          404
        );
      }
    }

    // Capture old values for logging
    const oldValue = {
      title: document.title,
      description: document.description,
      folderId: document.folderId,
    };

    const updated = await documentRepository.update(documentId, {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.folderId !== undefined && { folderId: data.folderId }),
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
        folderId: data.folderId ?? document.folderId,
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

  /**
   * Get document download stream info
   */
  async getDownloadStream(
    documentId: string,
    userId: string,
    ctx?: RequestContext
  ): Promise<{
    body: AsyncIterable<Uint8Array>;
    fileName: string;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    const startTime = Date.now();
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    // Get storageKey from current version
    const version = await documentVersionRepository.findByDocumentAndVersion(
      documentId,
      document.currentVersion
    );
    if (!version) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document version not found',
        404
      );
    }

    const stream = await documentStorageService.getDocumentStream(version.storageKey);

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: document.title,
      action: 'document.download',
      description: `Downloaded document: ${document.fileName}`,
      metadata: {
        fileName: document.fileName,
        fileSize: document.fileSize,
        version: document.currentVersion,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return {
      ...stream,
      fileName: document.fileName,
    };
  },

  // ==================== Trash Operations ====================

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

    // 4. Trigger reprocessing (will update totalChunks via delta calculation)
    processingService.processDocument(documentId, userId).catch((err) => {
      logger.warn({ documentId, err }, 'Failed to trigger processing after restore');
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

    // Delete all version files from storage (outside transaction - not rollbackable)
    for (const version of versions) {
      try {
        await documentStorageService.deleteDocument(version.storageKey);
      } catch (err) {
        logger.warn({ versionId: version.id, err }, 'Failed to delete version from storage');
      }
    }

    // Delete vectors from Qdrant (outside transaction - eventual consistency)
    try {
      const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(
        document.knowledgeBaseId
      );
      await vectorRepository.deleteByDocumentId(embeddingConfig.collectionName, documentId);
    } catch (err) {
      logger.warn({ documentId, err }, 'Failed to delete vectors from Qdrant');
    }

    // All MySQL operations in a single transaction
    await withTransaction(async (tx) => {
      await documentChunkRepository.deleteByDocumentId(documentId, tx);
      await documentVersionRepository.deleteByDocumentId(documentId, tx);
      await documentRepository.hardDelete(documentId, tx);
    });

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

  // ==================== Version Operations ====================

  /**
   * Upload a new version of a document
   * MySQL operations are wrapped in a transaction for atomicity.
   */
  async uploadNewVersion(
    documentId: string,
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    options?: { changeNote?: string },
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

    // Validate file
    const validation = documentStorageService.validateFile(file);
    if (!validation.valid) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.INVALID_FILE_TYPE as 'INVALID_FILE_TYPE',
        validation.error!,
        400
      );
    }

    // Upload new file to storage (outside transaction - not rollbackable)
    const { storageKey, fileExtension, documentType, resolvedMimeType } =
      await documentStorageService.uploadDocument(userId, file);

    // Extract text content
    let textContent: string | null = null;
    if (['markdown', 'text'].includes(documentType)) {
      textContent = file.buffer.toString('utf-8');
      if (textContent.length > 50000) {
        textContent = textContent.substring(0, 50000);
      }
    } else if (['pdf', 'docx'].includes(documentType)) {
      textContent = await documentStorageService.extractTextContent(storageKey, documentType);
    }

    const newVersion = document.currentVersion + 1;

    // MySQL operations in a single transaction
    const updated = await withTransaction(async (tx) => {
      // Create new version record
      await documentVersionRepository.create(
        {
          id: uuidv4(),
          documentId: document.id,
          version: newVersion,
          fileName: file.originalname,
          mimeType: resolvedMimeType,
          fileSize: file.size,
          fileExtension,
          documentType,
          storageKey,
          textContent,
          source: 'upload',
          changeNote: options?.changeNote ?? null,
          createdBy: userId,
        },
        tx
      );

      // Update document cached fields (don't reset chunkCount - let processDocument handle delta)
      return documentRepository.update(
        documentId,
        {
          currentVersion: newVersion,
          fileName: file.originalname,
          mimeType: resolvedMimeType,
          fileSize: file.size,
          fileExtension,
          documentType,
          processingStatus: 'pending',
          updatedBy: userId,
        },
        tx
      );
    });

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: document.title,
      action: 'document.upload_version',
      description: `Uploaded new version ${newVersion} for: ${document.title}`,
      metadata: {
        previousVersion: document.currentVersion,
        newVersion,
        fileName: file.originalname,
        fileSize: file.size,
        changeNote: options?.changeNote ?? null,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    // Trigger async document processing for RAG
    processingService.processDocument(documentId, userId).catch((err) => {
      logger.warn(
        { documentId, err },
        'Failed to trigger document processing after version upload'
      );
    });

    return toDocumentInfo(updated!);
  },

  /**
   * Get version history for a document
   */
  async getVersionHistory(documentId: string, userId: string): Promise<VersionListResponse> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    const versions = await documentVersionRepository.listByDocumentId(documentId);

    return {
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        fileName: v.fileName,
        fileSize: v.fileSize,
        source: v.source,
        changeNote: v.changeNote,
        createdAt: v.createdAt,
      })),
      currentVersion: document.currentVersion,
    };
  },

  /**
   * Restore document to a specific version
   * MySQL operations are wrapped in a transaction for atomicity.
   */
  async restoreVersion(
    documentId: string,
    versionId: string,
    userId: string,
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

    const version = await documentVersionRepository.findById(versionId);
    if (!version || version.documentId !== documentId) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Version not found',
        404
      );
    }

    const newVersionNumber = document.currentVersion + 1;

    // MySQL operations in a single transaction
    const updated = await withTransaction(async (tx) => {
      // Create a new version that restores old content
      await documentVersionRepository.create(
        {
          id: uuidv4(),
          documentId: document.id,
          version: newVersionNumber,
          fileName: version.fileName,
          mimeType: version.mimeType,
          fileSize: version.fileSize,
          fileExtension: version.fileExtension,
          documentType: version.documentType,
          storageKey: version.storageKey,
          textContent: version.textContent,
          source: 'restore',
          changeNote: `Restored from version ${version.version}`,
          createdBy: userId,
        },
        tx
      );

      // Update document cached fields (don't reset chunkCount - let processDocument handle delta)
      return documentRepository.update(
        documentId,
        {
          currentVersion: newVersionNumber,
          fileName: version.fileName,
          mimeType: version.mimeType,
          fileSize: version.fileSize,
          fileExtension: version.fileExtension,
          documentType: version.documentType,
          processingStatus: 'pending',
          updatedBy: userId,
        },
        tx
      );
    });

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: document.title,
      action: 'document.restore_version',
      description: `Restored document to version ${version.version}`,
      metadata: {
        previousVersion: document.currentVersion,
        restoredFromVersion: version.version,
        newVersion: newVersionNumber,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    // Trigger async document processing for RAG
    processingService.processDocument(documentId, userId).catch((err) => {
      logger.warn(
        { documentId, err },
        'Failed to trigger document processing after version restore'
      );
    });

    return toDocumentInfo(updated!);
  },
};
