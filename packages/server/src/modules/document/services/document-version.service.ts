import { v4 as uuidv4 } from 'uuid';
import { DOCUMENT_ERROR_CODES } from '@knowledge-agent/shared';
import type { DocumentInfo, VersionListResponse } from '@knowledge-agent/shared/types';
import type { Document } from '@shared/db/schema/document/documents.schema';
import { withTransaction } from '@shared/db/db.utils';
import { Errors } from '@shared/errors';
import { documentConfig } from '@config/env';
import { documentRepository } from '../repositories/document.repository';
import { documentVersionRepository } from '../repositories/document-version.repository';
import { documentStorageService } from './document-storage.service';
import { createLogger } from '@shared/logger';
import { logOperation } from '@shared/logger/operation-logger';
import { processingService } from '@modules/rag';

const logger = createLogger('document-version.service');

/**
 * Request context for logging
 */
interface RequestContext {
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
 * Document version service for version management operations
 */
export const documentVersionService = {
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

    // Upload new file to storage first (required before DB transaction)
    const { storageKey, fileExtension, documentType, resolvedMimeType } =
      await documentStorageService.uploadDocument(userId, file);

    // Extract text content
    // - Editable files (markdown/text): use higher limit for full editing capability
    // - Preview files (pdf/docx): use lower limit, full content available via download
    let textContent: string | null = null;
    if (['markdown', 'text'].includes(documentType)) {
      textContent = file.buffer.toString('utf-8');
      if (textContent.length > documentConfig.textContentMaxLength) {
        textContent = textContent.substring(0, documentConfig.textContentMaxLength);
      }
    } else if (['pdf', 'docx'].includes(documentType)) {
      const extracted = await documentStorageService.extractTextContent(
        storageKey,
        documentType,
        documentConfig.textPreviewMaxLength
      );
      textContent = extracted.text;
    }

    const newVersion = document.currentVersion + 1;

    // MySQL operations in a single transaction
    // If DB transaction fails, clean up the uploaded file to prevent orphans
    let updated: Document | undefined;
    try {
      updated = await withTransaction(async (tx) => {
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
    } catch (dbError) {
      // DB transaction failed — clean up the already-uploaded storage file
      logger.warn({ documentId, storageKey }, 'DB transaction failed, cleaning up uploaded file');
      try {
        await documentStorageService.deleteDocument(storageKey);
      } catch (cleanupErr) {
        logger.error(
          { documentId, storageKey, err: cleanupErr },
          'Failed to clean up orphaned storage file after DB error'
        );
      }
      throw dbError;
    }

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
