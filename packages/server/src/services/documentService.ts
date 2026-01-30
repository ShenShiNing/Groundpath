import { v4 as uuidv4 } from 'uuid';
import { DOCUMENT_ERROR_CODES } from '@knowledge-agent/shared';
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
} from '@knowledge-agent/shared/types';
import type { Document } from '../db/schema/document/documents';
import { AuthError } from '../utils/errors';
import { documentRepository } from '../repositories/documentRepository';
import { documentVersionRepository } from '../repositories/documentVersionRepository';
import { documentChunkRepository } from '../repositories/documentChunkRepository';
import { folderRepository } from '../repositories/folderRepository';
import { documentStorageService } from './documentStorageService';

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
    options?: { title?: string; description?: string; folderId?: string }
  ): Promise<DocumentInfo> {
    // Validate file
    const validation = documentStorageService.validateFile(file);
    if (!validation.valid) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.INVALID_FILE_TYPE as 'INVALID_FILE_TYPE',
        validation.error!,
        400
      );
    }

    // Validate folder if specified
    if (options?.folderId) {
      const folder = await folderRepository.findByIdAndUser(options.folderId, userId);
      if (!folder) {
        throw new AuthError(
          DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND as 'FOLDER_NOT_FOUND',
          'Target folder not found',
          404
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

    return toDocumentInfo(document);
  },

  /**
   * Get document by ID (with ownership check)
   */
  async getById(documentId: string, userId: string): Promise<DocumentInfo> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }
    return toDocumentInfo(document);
  },

  /**
   * List documents with pagination and filtering
   */
  async list(userId: string, params: DocumentListParams): Promise<DocumentListResponse> {
    const { documents, total } = await documentRepository.list(userId, params);

    return {
      documents: documents.map(toDocumentListItem),
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      },
    };
  },

  /**
   * Update document metadata
   */
  async update(
    documentId: string,
    userId: string,
    data: UpdateDocumentRequest
  ): Promise<DocumentInfo> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    // Validate target folder if changing
    if (data.folderId !== undefined && data.folderId !== null) {
      const folder = await folderRepository.findByIdAndUser(data.folderId, userId);
      if (!folder) {
        throw new AuthError(
          DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND as 'FOLDER_NOT_FOUND',
          'Target folder not found',
          404
        );
      }
    }

    const updated = await documentRepository.update(documentId, {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.folderId !== undefined && { folderId: data.folderId }),
      updatedBy: userId,
    });

    return toDocumentInfo(updated!);
  },

  /**
   * Delete document (soft delete)
   */
  async delete(documentId: string, userId: string): Promise<void> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    await documentRepository.softDelete(documentId, userId);
  },

  /**
   * Get document download stream info
   */
  async getDownloadStream(
    documentId: string,
    userId: string
  ): Promise<{
    body: AsyncIterable<Uint8Array>;
    fileName: string;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new AuthError(
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
      throw new AuthError(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document version not found',
        404
      );
    }

    const stream = await documentStorageService.getDocumentStream(version.storageKey);

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
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      },
    };
  },

  /**
   * Restore a deleted document
   */
  async restore(documentId: string, userId: string): Promise<DocumentInfo> {
    const document = await documentRepository.findDeletedByIdAndUser(documentId, userId);
    if (!document) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found in trash',
        404
      );
    }

    const restored = await documentRepository.restore(documentId);
    return toDocumentInfo(restored!);
  },

  /**
   * Permanently delete a document
   */
  async permanentDelete(documentId: string, userId: string): Promise<void> {
    const document = await documentRepository.findDeletedByIdAndUser(documentId, userId);
    if (!document) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found in trash',
        404
      );
    }

    // Delete all version files from storage
    const versions = await documentVersionRepository.listByDocumentId(documentId);
    for (const version of versions) {
      try {
        await documentStorageService.deleteDocument(version.storageKey);
      } catch (err) {
        console.error(`Failed to delete version ${version.id} from storage:`, err);
      }
    }

    // Delete chunks, versions, then document
    await documentChunkRepository.deleteByDocumentId(documentId);
    await documentVersionRepository.deleteByDocumentId(documentId);
    await documentRepository.hardDelete(documentId);
  },

  // ==================== Version Operations ====================

  /**
   * Upload a new version of a document
   */
  async uploadNewVersion(
    documentId: string,
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    options?: { changeNote?: string }
  ): Promise<DocumentInfo> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    // Validate file
    const validation = documentStorageService.validateFile(file);
    if (!validation.valid) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.INVALID_FILE_TYPE as 'INVALID_FILE_TYPE',
        validation.error!,
        400
      );
    }

    // Upload new file to storage
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

    // Create new version record
    await documentVersionRepository.create({
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
    });

    // Update document cached fields
    const updated = await documentRepository.update(documentId, {
      currentVersion: newVersion,
      fileName: file.originalname,
      mimeType: resolvedMimeType,
      fileSize: file.size,
      fileExtension,
      documentType,
      processingStatus: 'pending',
      chunkCount: 0,
      updatedBy: userId,
    });

    return toDocumentInfo(updated!);
  },

  /**
   * Get version history for a document
   */
  async getVersionHistory(documentId: string, userId: string): Promise<VersionListResponse> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new AuthError(
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
   */
  async restoreVersion(
    documentId: string,
    versionId: string,
    userId: string
  ): Promise<DocumentInfo> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    const version = await documentVersionRepository.findById(versionId);
    if (!version || version.documentId !== documentId) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Version not found',
        404
      );
    }

    const newVersionNumber = document.currentVersion + 1;

    // Create a new version that restores old content
    await documentVersionRepository.create({
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
    });

    // Update document cached fields
    const updated = await documentRepository.update(documentId, {
      currentVersion: newVersionNumber,
      fileName: version.fileName,
      mimeType: version.mimeType,
      fileSize: version.fileSize,
      fileExtension: version.fileExtension,
      documentType: version.documentType,
      processingStatus: 'pending',
      chunkCount: 0,
      updatedBy: userId,
    });

    return toDocumentInfo(updated!);
  },
};
