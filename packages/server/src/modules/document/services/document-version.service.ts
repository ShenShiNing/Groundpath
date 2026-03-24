import { v4 as uuidv4 } from 'uuid';
import { DOCUMENT_ERROR_CODES } from '@groundpath/shared';
import type { DocumentInfo, VersionListResponse } from '@groundpath/shared/types';
import type { Document } from '@core/db/schema/document/documents.schema';
import { withTransaction } from '@core/db/db.utils';
import { Errors } from '@core/errors';
import { documentConfig } from '@config/env';
import { documentRepository } from '../repositories/document.repository';
import { documentVersionRepository } from '../repositories/document-version.repository';
import { documentStorageService } from './document-storage.service';
import { createLogger } from '@core/logger';
import { logOperation } from '@core/logger/operation-logger';
import { dispatchDocumentProcessing } from '../ports/document-processing.port';

const logger = createLogger('document-version.service');

function documentNotFoundError(message: string = 'Document not found') {
  return Errors.auth(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND', message, 404);
}

function versionNotFoundError(message: string = 'Version not found') {
  return Errors.auth(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND', message, 404);
}

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
      throw documentNotFoundError();
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

    // MySQL operations in a single transaction
    // If DB transaction fails, clean up the uploaded file to prevent orphans
    let updated: Document | undefined;
    let versionContext:
      | {
          previousVersion: number;
          newVersion: number;
          title: string;
        }
      | undefined;
    try {
      updated = await withTransaction(async (tx) => {
        const lockedDocument = await documentRepository.lockByIdAndUser(documentId, userId, tx);
        if (!lockedDocument || lockedDocument.deletedAt) {
          throw documentNotFoundError();
        }

        const newVersion = lockedDocument.currentVersion + 1;
        versionContext = {
          previousVersion: lockedDocument.currentVersion,
          newVersion,
          title: lockedDocument.title,
        };

        // Create new version record
        await documentVersionRepository.create(
          {
            id: uuidv4(),
            documentId: lockedDocument.id,
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
      resourceName: versionContext?.title ?? document.title,
      action: 'document.upload_version',
      description: `Uploaded new version ${versionContext?.newVersion ?? document.currentVersion + 1} for: ${versionContext?.title ?? document.title}`,
      metadata: {
        previousVersion: versionContext?.previousVersion ?? document.currentVersion,
        newVersion: versionContext?.newVersion ?? document.currentVersion + 1,
        fileName: file.originalname,
        fileSize: file.size,
        changeNote: options?.changeNote ?? null,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    // Enqueue document processing for RAG (non-blocking)
    dispatchDocumentProcessing(documentId, userId, {
      targetDocumentVersion: versionContext?.newVersion ?? document.currentVersion + 1,
      reason: 'upload',
    }).catch((err) => {
      logger.warn(
        { documentId, err },
        'Failed to enqueue document processing after version upload'
      );
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
      throw documentNotFoundError();
    }

    const version = await documentVersionRepository.findById(versionId);
    if (!version || version.documentId !== documentId) {
      throw versionNotFoundError();
    }

    // MySQL operations in a single transaction
    let versionContext:
      | {
          previousVersion: number;
          newVersion: number;
          title: string;
        }
      | undefined;
    const updated = await withTransaction(async (tx) => {
      const lockedDocument = await documentRepository.lockByIdAndUser(documentId, userId, tx);
      if (!lockedDocument || lockedDocument.deletedAt) {
        throw documentNotFoundError();
      }

      const newVersionNumber = lockedDocument.currentVersion + 1;
      versionContext = {
        previousVersion: lockedDocument.currentVersion,
        newVersion: newVersionNumber,
        title: lockedDocument.title,
      };

      // Create a new version that restores old content
      await documentVersionRepository.create(
        {
          id: uuidv4(),
          documentId: lockedDocument.id,
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
      resourceName: versionContext?.title ?? document.title,
      action: 'document.restore_version',
      description: `Restored document to version ${version.version}`,
      metadata: {
        previousVersion: versionContext?.previousVersion ?? document.currentVersion,
        restoredFromVersion: version.version,
        newVersion: versionContext?.newVersion ?? document.currentVersion + 1,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    // Enqueue document processing for RAG (non-blocking)
    dispatchDocumentProcessing(documentId, userId, {
      targetDocumentVersion: versionContext?.newVersion ?? document.currentVersion + 1,
      reason: 'restore',
    }).catch((err) => {
      logger.warn(
        { documentId, err },
        'Failed to enqueue document processing after version restore'
      );
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

    return toDocumentInfo(updated!);
  },
};
